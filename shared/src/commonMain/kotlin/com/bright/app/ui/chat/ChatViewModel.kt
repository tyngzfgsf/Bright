package com.bright.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.AnalyticsEvent
import com.bright.app.data.analytics.ScenarioLabel
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.PaywallReason
import com.bright.app.data.local.ChatDao
import com.bright.app.util.currentLocalEpochDay
import com.bright.app.util.currentTimeMillis
import com.bright.app.data.local.MessageEntity
import com.bright.app.data.local.QuestionRecordEntity
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqMessage
import com.bright.app.data.remote.AiGateway
import com.bright.app.data.remote.AiResult
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.domain.AiTurn
import com.bright.app.domain.AiTurnParser
import com.bright.app.domain.DailyStreak
import com.bright.app.domain.ExpertDebrief
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.Feature
import com.bright.app.domain.ScenarioPromptBuilder
import com.bright.app.domain.SpacedRepetitionScheduler
import com.bright.app.domain.syncLocalNotifications
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ChatMessage
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.MessageRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import com.bright.app.util.ApiResult
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import com.bright.app.util.randomId
import com.bright.app.resources.Res
import com.bright.app.resources.chat_not_connected
import com.bright.app.resources.chat_out_of_drills
import org.jetbrains.compose.resources.getString

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isSending: Boolean = false,
    val isCompleted: Boolean = false,
    val errorMessage: String? = null,
    val averageScore: Double? = null,
    val language: Language = Language.ENGLISH,
    val scenarioType: String? = null,
    val customScenario: String? = null,
    val streakDays: Int = 0,
    val showNotificationPermissionPrompt: Boolean = false
)

class ChatViewModel(
    private val sessionId: String,
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    private val aiGateway: AiGateway,
    private val billing: BillingRepository,
    private val notifier: LocalNotifier,
    private val analytics: Analytics
) : ViewModel() {

    private val _isSending = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private var session: SessionEntity? = null
    private var hasTriggeredOpening = false

    // A genuine new-day streak increment, for the UI to fire a "pronounced" haptic on — a
    // SharedFlow rather than derived from ChatUiState so it can't misfire from a stale value
    // simply settling into place on first collection.
    private val _streakMilestoneEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val streakMilestoneEvent: SharedFlow<Unit> = _streakMilestoneEvent

    /** An action needs a paid plan (or more drills). The screen answers by opening the paywall. */
    private val _paywallEvent = MutableSharedFlow<PaywallReason>(extraBufferCapacity = 1)
    val paywallEvent: SharedFlow<PaywallReason> = _paywallEvent

    /** Plan and usage, for the expert-debrief button and the near-limit nudge. */
    val entitlement: StateFlow<Entitlement> = billing.entitlement

    /** Whether this trainee's drills are metered (signed in, no own key). */
    val isHosted: StateFlow<Boolean> = billing.isHosted
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val messagesFlow = dao.observeMessages(sessionId)

    val uiState: StateFlow<ChatUiState> = combine(
        messagesFlow, _isSending, _errorMessage, preferences.streakState, preferences.notificationPermissionAsked
    ) { entities, sending, error, streakState, permissionAsked ->
        val currentSession = session
        ChatUiState(
            messages = entities.map { it.toDomain() },
            isSending = sending,
            isCompleted = currentSession?.isCompleted ?: false,
            errorMessage = error,
            averageScore = currentSession?.let {
                if (it.answeredCount > 0) it.totalScore.toDouble() / it.answeredCount else null
            },
            language = Language.fromCode(currentSession?.languageCode),
            scenarioType = currentSession?.scenarioType,
            customScenario = currentSession?.customScenario,
            streakDays = DailyStreak.displayedCount(streakState, currentLocalEpochDay()),
            showNotificationPermissionPrompt = (currentSession?.isCompleted ?: false) && !permissionAsked
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ChatUiState())

    init {
        viewModelScope.launch {
            session = dao.getSession(sessionId)
            messagesFlow.collect { msgs ->
                if (msgs.isEmpty() && !hasTriggeredOpening && session?.isCompleted == false) {
                    hasTriggeredOpening = true
                    triggerOpening()
                }
            }
        }
    }

    private fun currentLanguage(): Language = Language.fromCode(session?.languageCode)
    private fun currentTraineeRole(): TraineeRole =
        TraineeRole.valueOf(session?.role ?: TraineeRole.DOCTOR.name)
    private fun currentDifficulty(): Difficulty =
        Difficulty.valueOf(session?.difficulty ?: Difficulty.INTERMEDIATE.name)

    private fun resolvedScenarioDescription(): String {
        val s = session ?: return ""
        s.customScenario?.takeIf { it.isNotBlank() }?.let { return it }
        return s.scenarioType?.let { ScenarioType.valueOf(it).promptKeyword } ?: ""
    }

    private fun resolvedAiRoleDescription(): String {
        val s = session ?: return ""
        s.customAiRole?.takeIf { it.isNotBlank() }?.let { return it }
        return AiCharacterRole.valueOf(s.aiRole).promptLabel
    }

    private fun systemPrompt(): String = ScenarioPromptBuilder.buildSystemPrompt(
        scenarioDescription = resolvedScenarioDescription(),
        aiRoleDescription = resolvedAiRoleDescription(),
        traineeRole = currentTraineeRole(),
        difficulty = currentDifficulty(),
        language = currentLanguage()
    )

    private suspend fun historyAsGroqMessages(): List<GroqMessage> {
        val current = messagesFlow.first()
        return current.map {
            val isUserTurn = it.role == MessageRole.USER.name || it.role == MessageRole.USER_ASK.name
            GroqMessage(
                role = if (isUserTurn) "user" else "assistant",
                content = it.text
            )
        }
    }

    /**
     * Every model call goes through [AiGateway], which picks the trainee's own key or the hosted
     * proxy. Running out of hosted drills surfaces as an error line *and* a paywall event, so
     * dismissing the paywall leaves an honest explanation on screen rather than a dead chat.
     */
    private suspend fun sendToAi(messages: List<GroqMessage>, expectJson: Boolean): ApiResult<String> =
        when (val result = aiGateway.send(sessionId, messages, expectJson)) {
            is AiResult.Success -> ApiResult.Success(result.text)
            is AiResult.Error -> ApiResult.Error(result.message)
            AiResult.OutOfDrills -> {
                _paywallEvent.tryEmit(PaywallReason.DRILL_LIMIT)
                ApiResult.Error(getString(Res.string.chat_out_of_drills))
            }
            AiResult.NotConnected -> ApiResult.Error(getString(Res.string.chat_not_connected))
        }

    private suspend fun callAi(extraTrailingUserMessage: String? = null): ApiResult<AiTurn> {
        val messages = buildList {
            add(GroqMessage(role = "system", content = systemPrompt()))
            addAll(historyAsGroqMessages())
            extraTrailingUserMessage?.let { add(GroqMessage(role = "user", content = it)) }
        }
        return when (val result = sendToAi(messages, expectJson = true)) {
            is ApiResult.Success -> ApiResult.Success(AiTurnParser.parse(result.data))
            is ApiResult.Error -> ApiResult.Error(result.message)
        }
    }

    /**
     * At this point in [applyTurn], the just-graded round's AI_QUESTION and USER answer are
     * already the *most recent* messages of their kind — this turn's own AI_FEEDBACK/next
     * AI_QUESTION haven't been inserted yet, so a simple "last of each role" lookup is enough
     * to pair them without a more complex explicit link between messages.
     *
     * Every graded round gets its own new record with a freshly-computed initial schedule.
     * When this session was started specifically to review an existing due record (see
     * `HomeViewModel`/`StatsViewModel.startReviewSession`), that *original* record's own
     * schedule is additionally advanced in place from its own prior state — this is what
     * makes the interval actually grow across repeated reviews of the same missed case,
     * rather than every attempt starting its schedule over from scratch.
     */
    private suspend fun recordGradedQuestion(score: Int) {
        val recent = messagesFlow.first()
        val question = recent.lastOrNull { it.role == MessageRole.AI_QUESTION.name } ?: return
        val answer = recent.lastOrNull { it.role == MessageRole.USER.name } ?: return
        // An answer from before this question belongs to an earlier round — don't pair them.
        if (answer.timestampMillis < question.timestampMillis) return
        val s = session ?: return
        val now = currentTimeMillis()

        val initialSchedule = SpacedRepetitionScheduler.next(SpacedRepetitionScheduler.INITIAL_SCHEDULE, score)
        dao.insertQuestionRecord(
            QuestionRecordEntity(
                id = randomId(),
                sessionId = sessionId,
                scenarioType = s.scenarioType,
                customScenario = s.customScenario,
                questionText = question.text,
                answerText = answer.text,
                score = score,
                timestampMillis = now,
                repetitionCount = initialSchedule.repetitionCount,
                easeFactor = initialSchedule.easeFactor,
                intervalDays = initialSchedule.intervalDays,
                dueAtMillis = SpacedRepetitionScheduler.dueAtMillis(initialSchedule, now)
            )
        )

        s.reviewOfRecordId?.let { originalId ->
            dao.getQuestionRecord(originalId)?.let { original ->
                val updatedSchedule = SpacedRepetitionScheduler.next(
                    SpacedRepetitionScheduler.Schedule(
                        repetitionCount = original.repetitionCount,
                        easeFactor = original.easeFactor,
                        intervalDays = original.intervalDays
                    ),
                    score
                )
                dao.updateQuestionRecord(
                    original.copy(
                        repetitionCount = updatedSchedule.repetitionCount,
                        easeFactor = updatedSchedule.easeFactor,
                        intervalDays = updatedSchedule.intervalDays,
                        dueAtMillis = SpacedRepetitionScheduler.dueAtMillis(updatedSchedule, now)
                    )
                )
            }
        }
    }

    private suspend fun applyTurn(turn: AiTurn) {
        val now = currentTimeMillis()

        if (turn.score != null || turn.feedback != null) {
            if (turn.score != null) {
                recordGradedQuestion(score = turn.score)
            }
            dao.insertMessage(
                MessageEntity(
                    id = randomId(),
                    sessionId = sessionId,
                    role = MessageRole.AI_FEEDBACK.name,
                    text = turn.feedback.orEmpty(),
                    score = turn.score,
                    timestampMillis = now
                )
            )
            if (turn.score != null) {
                session?.let {
                    val updated = it.copy(
                        totalScore = it.totalScore + turn.score,
                        answeredCount = it.answeredCount + 1
                    )
                    dao.updateSession(updated)
                    session = updated
                    analytics.log(
                        AnalyticsEvent.AnswerScored(
                            scenario = updated.scenarioLabel(),
                            score = turn.score,
                            answerNumber = updated.answeredCount,
                            isReview = updated.reviewOfRecordId != null
                        )
                    )
                }
            }
        }

        if (turn.sessionComplete) {
            dao.insertMessage(
                MessageEntity(
                    id = randomId(),
                    sessionId = sessionId,
                    role = MessageRole.SYSTEM_SUMMARY.name,
                    text = turn.nextPrompt,
                    timestampMillis = now + 1
                )
            )
            session?.let {
                val updated = it.copy(isCompleted = true, summary = turn.nextPrompt, lastUpdatedAtMillis = now)
                dao.updateSession(updated)
                session = updated
                analytics.log(
                    AnalyticsEvent.SessionCompleted(
                        scenario = updated.scenarioLabel(),
                        answeredCount = updated.answeredCount,
                        averageScore = if (updated.answeredCount > 0) {
                            updated.totalScore.toDouble() / updated.answeredCount
                        } else {
                            null
                        },
                        isReview = updated.reviewOfRecordId != null
                    )
                )
            }
            val freezes = billing.streakFreezesAvailable.first()
            if (preferences.recordActiveDay(currentLocalEpochDay(), freezes)) {
                _streakMilestoneEvent.tryEmit(Unit)
                analytics.log(AnalyticsEvent.StreakDayReached(preferences.streakState.first().count))
            }
        } else {
            dao.insertMessage(
                MessageEntity(
                    id = randomId(),
                    sessionId = sessionId,
                    role = MessageRole.AI_QUESTION.name,
                    text = turn.nextPrompt,
                    timestampMillis = now + 1
                )
            )
            touchSession()
        }

        // Every graded round and every completion can change whether either reminder should be
        // pending (a completed session secures today's streak; a graded round can clear the due
        // queue) — cheapest to just re-derive both from scratch here rather than track deltas.
        syncLocalNotifications(dao, preferences, notifier)
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        viewModelScope.launch {
            preferences.setNotificationPermissionAsked(true)
            if (granted) {
                syncLocalNotifications(dao, preferences, notifier)
            }
        }
    }

    private fun triggerOpening() {
        viewModelScope.launch {
            _isSending.value = true
            _errorMessage.value = null
            when (val result = callAi(extraTrailingUserMessage = ScenarioPromptBuilder.openingPrompt(currentLanguage()))) {
                is ApiResult.Success -> applyTurn(result.data)
                is ApiResult.Error -> {
                    _errorMessage.value = result.message
                    hasTriggeredOpening = false
                }
            }
            _isSending.value = false
        }
    }

    fun sendMessage(text: String) {
        if (text.isBlank() || _isSending.value) return
        viewModelScope.launch {
            _errorMessage.value = null
            dao.insertMessage(
                MessageEntity(
                    id = randomId(),
                    sessionId = sessionId,
                    role = MessageRole.USER.name,
                    text = text.trim(),
                    timestampMillis = currentTimeMillis()
                )
            )
            touchSession()
            requestAiReply()
        }
    }

    /**
     * Side-channel: answers a trainee question without grading it or advancing the scenario.
     * The pending scenario question (if any) stays exactly as it was.
     */
    fun askQuestion(text: String) {
        if (text.isBlank() || _isSending.value) return
        viewModelScope.launch {
            _errorMessage.value = null
            dao.insertMessage(
                MessageEntity(
                    id = randomId(),
                    sessionId = sessionId,
                    role = MessageRole.USER_ASK.name,
                    text = text.trim(),
                    timestampMillis = currentTimeMillis()
                )
            )
            _isSending.value = true
            val messages = listOf(
                GroqMessage(role = "system", content = ScenarioPromptBuilder.askAsideSystemPrompt(currentLanguage()))
            ) + historyAsGroqMessages()

            when (val result = sendToAi(messages, expectJson = false)) {
                is ApiResult.Success -> {
                    dao.insertMessage(
                        MessageEntity(
                            id = randomId(),
                            sessionId = sessionId,
                            role = MessageRole.AI_ANSWER.name,
                            text = result.data.trim(),
                            timestampMillis = currentTimeMillis()
                        )
                    )
                }
                is ApiResult.Error -> _errorMessage.value = result.message
            }
            _isSending.value = false
        }
    }

    fun retry() {
        if (_isSending.value) return
        viewModelScope.launch {
            if (messagesFlow.first().isEmpty()) {
                hasTriggeredOpening = true
                triggerOpening()
            } else {
                requestAiReply()
            }
        }
    }

    private suspend fun requestAiReply() {
        _isSending.value = true
        _errorMessage.value = null
        when (val result = callAi()) {
            is ApiResult.Success -> applyTurn(result.data)
            is ApiResult.Error -> _errorMessage.value = result.message
        }
        _isSending.value = false
    }

    fun shuffleScenario() {
        if (_isSending.value) return
        viewModelScope.launch {
            _isSending.value = true
            _errorMessage.value = null

            val currentScenarioName = session?.scenarioType
            val newScenario = ScenarioType.entries
                .filter { it.name != currentScenarioName }
                .randomOrNull() ?: ScenarioType.entries.random()

            session?.let {
                val updated = it.copy(
                    scenarioType = newScenario.name,
                    customScenario = null,
                    lastUpdatedAtMillis = currentTimeMillis()
                )
                dao.updateSession(updated)
                session = updated
            }

            val prompt = ScenarioPromptBuilder.newScenarioPrompt(resolvedScenarioDescription(), currentLanguage())
            when (val result = callAi(extraTrailingUserMessage = prompt)) {
                is ApiResult.Success -> applyTurn(result.data)
                is ApiResult.Error -> _errorMessage.value = result.message
            }
            _isSending.value = false
        }
    }

    fun endSession() {
        if (_isSending.value) return
        viewModelScope.launch {
            _isSending.value = true
            _errorMessage.value = null
            // Ending normally happens with a question still open. The prompt says to grade only
            // an answer given in this turn, but models grade the open question anyway (0/10,
            // "you ended early"), which drags the average down and files a review item pairing
            // that question with the *previous* answer. Nothing was answered, so nothing is graded.
            val lastExchange = messagesFlow.first().lastOrNull {
                it.role == MessageRole.AI_QUESTION.name || it.role == MessageRole.USER.name
            }
            val hasUngradedAnswer = lastExchange?.role == MessageRole.USER.name
            when (val result = callAi(extraTrailingUserMessage = ScenarioPromptBuilder.endSessionPrompt(currentLanguage()))) {
                is ApiResult.Success -> applyTurn(
                    if (hasUngradedAnswer) result.data.copy(sessionComplete = true)
                    else result.data.copy(score = null, feedback = null, sessionComplete = true)
                )
                is ApiResult.Error -> _errorMessage.value = result.message
            }
            _isSending.value = false
        }
    }

    /**
     * Pro: an attending-level review of the finished case, appended as an answer bubble. For
     * anyone without Pro this is the feature-gated upgrade prompt — the button stays visible and
     * opens the paywall, which is how most people discover the feature exists at all.
     */
    fun requestExpertDebrief() {
        if (_isSending.value) return
        if (!billing.entitlement.value.has(Feature.EXPERT_DEBRIEF)) {
            _paywallEvent.tryEmit(PaywallReason.EXPERT_DEBRIEF)
            return
        }
        viewModelScope.launch {
            _isSending.value = true
            _errorMessage.value = null
            val messages = buildList {
                add(
                    GroqMessage(
                        role = "system",
                        content = ExpertDebrief.systemPrompt(resolvedScenarioDescription(), currentTraineeRole(), currentLanguage())
                    )
                )
                addAll(historyAsGroqMessages())
                add(GroqMessage(role = "user", content = ExpertDebrief.request(currentLanguage())))
            }
            when (val result = sendToAi(messages, expectJson = false)) {
                is ApiResult.Success -> dao.insertMessage(
                    MessageEntity(
                        id = randomId(),
                        sessionId = sessionId,
                        role = MessageRole.AI_ANSWER.name,
                        text = result.data,
                        timestampMillis = currentTimeMillis()
                    )
                )
                is ApiResult.Error -> _errorMessage.value = result.message
            }
            _isSending.value = false
        }
    }

    private suspend fun touchSession() {
        session?.let {
            val updated = it.copy(lastUpdatedAtMillis = currentTimeMillis())
            dao.updateSession(updated)
            session = updated
        }
    }

    /**
     * Leaving the chat screen clears this ViewModel (a configuration change doesn't), so an
     * unfinished session at this point was walked away from. Re-opening it from History and
     * leaving again logs again — that's a second abandonment, not a duplicate.
     */
    override fun onCleared() {
        val s = session ?: return
        if (!s.isCompleted) {
            analytics.log(
                AnalyticsEvent.SessionAbandoned(
                    scenario = s.scenarioLabel(),
                    answeredCount = s.answeredCount,
                    isReview = s.reviewOfRecordId != null
                )
            )
        }
    }

    private fun SessionEntity.scenarioLabel() = ScenarioLabel.of(scenarioType, customScenario)

    private fun MessageEntity.toDomain() = ChatMessage(
        id = id,
        role = MessageRole.valueOf(role),
        text = text,
        score = score,
        timestampMillis = timestampMillis
    )
}
