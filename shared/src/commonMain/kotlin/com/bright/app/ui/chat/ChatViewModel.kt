package com.bright.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.AnalyticsEvent
import com.bright.app.data.analytics.ScenarioLabel
import com.bright.app.data.local.ChatDao
import com.bright.app.util.currentLocalEpochDay
import com.bright.app.util.currentTimeMillis
import com.bright.app.data.local.MessageEntity
import com.bright.app.data.local.QuestionRecordEntity
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqMessage
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.domain.AiTurn
import com.bright.app.domain.AiTurnParser
import com.bright.app.domain.DailyStreak
import com.bright.app.domain.PatientVitals
import com.bright.app.domain.ScenarioClock
import com.bright.app.domain.ScenarioPromptBuilder
import com.bright.app.domain.ScenarioState
import com.bright.app.domain.TimelineEvent
import com.bright.app.domain.VitalsConsistency
import com.bright.app.domain.VitalsReadingParser
import com.bright.app.domain.VitalsTrend
import com.bright.app.domain.SpacedRepetitionScheduler
import com.bright.app.domain.syncLocalNotifications
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ChatMessage
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.MessageRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.ScoringCriteria
import com.bright.app.domain.model.ScoringCriterion
import com.bright.app.domain.model.TriageSystem
import com.bright.app.domain.model.TraineeRole
import com.bright.app.util.ApiResult
import kotlinx.coroutines.flow.Flow
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
    val showNotificationPermissionPrompt: Boolean = false,
    val decompensationEnabled: Boolean = false,
    /** When the question still awaiting an answer was asked — drives the on-screen decision timer. */
    val openQuestionAtMillis: Long? = null,
    val lateAfterSeconds: Long = ScenarioClock.lateAfterSeconds(Difficulty.INTERMEDIATE),
    /** The server rules engine's patient monitor, when a simulation session is driving this chat; null hides the panel. */
    val vitals: PatientVitals? = null,
    /** True while the running simulation scenario is flagged "needs medical review" by the server. */
    val vitalsNeedReview: Boolean = false
)

class ChatViewModel(
    private val sessionId: String,
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    private val groqRepository: GroqRepository,
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

    private val messagesFlow = dao.observeMessages(sessionId)

    private val _engineMonitor = MutableStateFlow<Pair<PatientVitals, Boolean>?>(null)

    /**
     * Feed the `state` of each response from the server's simulation endpoint here (parsed with
     * [PatientVitalsParser]); pass null to hide the monitor. The app only displays it, never computes it.
     */
    fun onEngineState(vitals: PatientVitals?, needsReview: Boolean = false) {
        _engineMonitor.value = vitals?.let { it to needsReview }
    }

    private val baseState: Flow<ChatUiState> = combine(
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
            showNotificationPermissionPrompt = (currentSession?.isCompleted ?: false) && !permissionAsked,
            decompensationEnabled = currentSession?.decompensationEnabled ?: false,
            openQuestionAtMillis = ScenarioClock.openQuestionAt(entities.map { it.toEvent() }),
            lateAfterSeconds = ScenarioClock.lateAfterSeconds(currentDifficulty())
        )
    }

    val uiState: StateFlow<ChatUiState> = combine(baseState, _engineMonitor) { state, monitor ->
        state.copy(vitals = monitor?.first, vitalsNeedReview = monitor?.second ?: false)
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

    /** The preset scenario — or null when a custom description is what the AI is actually running. */
    private fun resolvedScenarioType(): ScenarioType? {
        val s = session ?: return null
        if (!s.customScenario.isNullOrBlank()) return null
        return s.scenarioType?.let { runCatching { ScenarioType.valueOf(it) }.getOrNull() }
    }

    private fun systemPrompt(triageSystem: TriageSystem, criteria: List<ScoringCriterion>, state: ScenarioState): String =
        ScenarioPromptBuilder.buildSystemPrompt(
            scenarioDescription = resolvedScenarioDescription(),
            aiRoleDescription = resolvedAiRoleDescription(),
            traineeRole = currentTraineeRole(),
            difficulty = currentDifficulty(),
            language = currentLanguage(),
            triageSystem = triageSystem,
            criteria = criteria,
            state = state
        )

    private suspend fun scenarioState(): ScenarioState = ScenarioClock.stateAt(
        events = messagesFlow.first().map { it.toEvent() },
        nowMillis = currentTimeMillis(),
        difficulty = currentDifficulty(),
        decompensationEnabled = session?.decompensationEnabled ?: false
    )

    private suspend fun historyAsGroqMessages(): List<GroqMessage> {
        val current = messagesFlow.first()
        return current.map {
            val isUserTurn = it.role == MessageRole.USER.name ||
                it.role == MessageRole.USER_ASK.name ||
                it.role == MessageRole.USER_VITALS_CHECK.name
            GroqMessage(
                role = if (isUserTurn) "user" else "assistant",
                content = if (it.role == MessageRole.USER_VITALS_CHECK.name) ScenarioPromptBuilder.VITALS_CHECK_MARKER else it.text
            )
        }
    }

    /**
     * The returned turn's `basis` has already been checked: it's the canonical ID of a criterion
     * this very prompt offered, or null. Whatever the model actually wrote there is never stored
     * or shown — see [ScoringCriteria.resolve].
     */
    private suspend fun callAi(extraTrailingUserMessage: String? = null): ApiResult<AiTurn> {
        val triageSystem = preferences.triageSystem.first()
        val criteria = ScoringCriteria.offeredFor(triageSystem, resolvedScenarioType())
        return when (val result = callAiRaw(triageSystem, criteria, scenarioState(), extraTrailingUserMessage)) {
            is ApiResult.Success -> {
                val turn = AiTurnParser.parse(result.data)
                ApiResult.Success(turn.copy(basis = ScoringCriteria.resolve(turn.basis, criteria)?.id))
            }
            is ApiResult.Error -> ApiResult.Error(result.message)
        }
    }

    private suspend fun callAiRaw(
        triageSystem: TriageSystem,
        criteria: List<ScoringCriterion>,
        state: ScenarioState,
        extraTrailingUserMessage: String?
    ): ApiResult<String> {
        val apiKey = preferences.groqApiKey.first().orEmpty()
        val model = preferences.groqModel.first()
        val messages = buildList {
            add(GroqMessage(role = "system", content = systemPrompt(triageSystem, criteria, state)))
            addAll(historyAsGroqMessages())
            extraTrailingUserMessage?.let { add(GroqMessage(role = "user", content = it)) }
        }
        return groqRepository.sendConversation(apiKey, model, messages, jsonMode = false)
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
                    // A score always records what it cited, even when that's nothing usable:
                    // UNCITED rather than null, so it isn't mistaken for a pre-citation answer.
                    criterionId = turn.score?.let { turn.basis ?: ScoringCriteria.UNCITED },
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
            if (preferences.recordActiveDay(currentLocalEpochDay())) {
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
            val apiKey = preferences.groqApiKey.first().orEmpty()
            val model = preferences.groqModel.first()
            val messages = listOf(
                GroqMessage(role = "system", content = ScenarioPromptBuilder.askAsideSystemPrompt(currentLanguage()))
            ) + historyAsGroqMessages()

            when (val result = groqRepository.sendConversation(apiKey, model, messages, jsonMode = false)) {
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
            val messages = messagesFlow.first()
            when {
                messages.isEmpty() -> {
                    hasTriggeredOpening = true
                    triggerOpening()
                }
                // A failed vitals check must be retried as a vitals check: sent as an ordinary
                // reply it would come back as a graded turn and advance the question.
                messages.last().role == MessageRole.USER_VITALS_CHECK.name -> requestVitalsReading()
                else -> requestAiReply()
            }
        }
    }

    /**
     * Mid-scenario "check vitals". Never graded and never advances the question: it doesn't go
     * through [applyTurn], so it can't touch the session's score, answer count or review queue.
     * Which way the numbers move is decided here, on-device, from the trainee's graded answers
     * (and, with decompensation on, from how long the open question has been waiting).
     */
    fun checkVitals() {
        if (_isSending.value || session?.isCompleted != false) return
        viewModelScope.launch {
            _errorMessage.value = null
            dao.insertMessage(
                MessageEntity(
                    id = randomId(),
                    sessionId = sessionId,
                    role = MessageRole.USER_VITALS_CHECK.name,
                    text = ScenarioPromptBuilder.VITALS_CHECK_MARKER,
                    timestampMillis = currentTimeMillis()
                )
            )
            requestVitalsReading()
        }
    }

    private suspend fun requestVitalsReading() {
        _isSending.value = true
        _errorMessage.value = null
        val events = messagesFlow.first().map { it.toEvent() }
        val now = currentTimeMillis()
        val decompensation = session?.decompensationEnabled ?: false
        val trend = ScenarioClock.vitalsTrend(events, now, currentDifficulty(), decompensation)
        val state = scenarioState()
        val previousReading = messagesFlow.first().lastOrNull { it.role == MessageRole.AI_VITALS.name }?.text
        val triageSystem = preferences.triageSystem.first()
        val criteria = ScoringCriteria.offeredFor(triageSystem, resolvedScenarioType())
        val prompt = ScenarioPromptBuilder.vitalsCheckPrompt(trend, state, previousReading, currentLanguage())

        when (val result = callAiRaw(triageSystem, criteria, state, prompt)) {
            is ApiResult.Success -> {
                var reading = VitalsReadingParser.parse(result.data)
                // The trend chip is the app's verdict on the trainee's intervention, so the numbers
                // under it must agree. One corrective retry; a failed retry keeps the first reading
                // rather than turning a vitals check into an error.
                if (VitalsConsistency.contradicts(trend, previousReading, reading.vitals)) {
                    val retry = callAiRaw(
                        triageSystem, criteria, state,
                        prompt + ScenarioPromptBuilder.vitalsCorrection(reading.vitals)
                    )
                    if (retry is ApiResult.Success) reading = VitalsReadingParser.parse(retry.data)
                }
                dao.insertMessage(
                    MessageEntity(
                        id = randomId(),
                        sessionId = sessionId,
                        role = MessageRole.AI_VITALS.name,
                        text = reading.displayText,
                        vitalsTrend = trend.name,
                        timestampMillis = currentTimeMillis()
                    )
                )
                touchSession()
            }
            is ApiResult.Error -> _errorMessage.value = result.message
        }
        _isSending.value = false
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
                    else result.data.copy(score = null, feedback = null, basis = null, sessionComplete = true)
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
        criterion = ScoringCriteria.byId(criterionId),
        scoreUncited = criterionId == ScoringCriteria.UNCITED,
        vitalsTrend = vitalsTrend?.let { runCatching { VitalsTrend.valueOf(it) }.getOrNull() },
        timestampMillis = timestampMillis
    )

    private fun MessageEntity.toEvent() = TimelineEvent(
        role = runCatching { MessageRole.valueOf(role) }.getOrElse { MessageRole.AI_ANSWER },
        timestampMillis = timestampMillis,
        score = score
    )
}
