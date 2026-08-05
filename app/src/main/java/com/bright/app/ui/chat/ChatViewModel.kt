package com.bright.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.MessageEntity
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqMessage
import com.bright.app.data.remote.GroqRepository
import com.bright.app.domain.AiTurn
import com.bright.app.domain.AiTurnParser
import com.bright.app.domain.ScenarioPromptBuilder
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ChatMessage
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.MessageRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import com.bright.app.util.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isSending: Boolean = false,
    val isCompleted: Boolean = false,
    val errorMessage: String? = null,
    val averageScore: Double? = null,
    val language: Language = Language.ENGLISH
)

class ChatViewModel(
    private val sessionId: String,
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    private val groqRepository: GroqRepository
) : ViewModel() {

    private val _isSending = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private var session: SessionEntity? = null
    private var hasTriggeredOpening = false

    private val messagesFlow = dao.observeMessages(sessionId)

    val uiState: StateFlow<ChatUiState> = combine(
        messagesFlow, _isSending, _errorMessage
    ) { entities, sending, error ->
        val currentSession = session
        ChatUiState(
            messages = entities.map { it.toDomain() },
            isSending = sending,
            isCompleted = currentSession?.isCompleted ?: false,
            errorMessage = error,
            averageScore = currentSession?.let {
                if (it.answeredCount > 0) it.totalScore.toDouble() / it.answeredCount else null
            },
            language = Language.fromCode(currentSession?.languageCode)
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

    private suspend fun callAi(extraTrailingUserMessage: String? = null): ApiResult<AiTurn> {
        val apiKey = preferences.groqApiKey.first().orEmpty()
        val model = preferences.groqModel.first()
        val messages = buildList {
            add(GroqMessage(role = "system", content = systemPrompt()))
            addAll(historyAsGroqMessages())
            extraTrailingUserMessage?.let { add(GroqMessage(role = "user", content = it)) }
        }
        return when (val result = groqRepository.sendConversation(apiKey, model, messages, jsonMode = false)) {
            is ApiResult.Success -> ApiResult.Success(AiTurnParser.parse(result.data))
            is ApiResult.Error -> ApiResult.Error(result.message)
        }
    }

    private suspend fun applyTurn(turn: AiTurn) {
        val now = System.currentTimeMillis()

        if (turn.score != null || turn.feedback != null) {
            dao.insertMessage(
                MessageEntity(
                    id = UUID.randomUUID().toString(),
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
                }
            }
        }

        if (turn.sessionComplete) {
            dao.insertMessage(
                MessageEntity(
                    id = UUID.randomUUID().toString(),
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
            }
        } else {
            dao.insertMessage(
                MessageEntity(
                    id = UUID.randomUUID().toString(),
                    sessionId = sessionId,
                    role = MessageRole.AI_QUESTION.name,
                    text = turn.nextPrompt,
                    timestampMillis = now + 1
                )
            )
            touchSession()
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
                    id = UUID.randomUUID().toString(),
                    sessionId = sessionId,
                    role = MessageRole.USER.name,
                    text = text.trim(),
                    timestampMillis = System.currentTimeMillis()
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
                    id = UUID.randomUUID().toString(),
                    sessionId = sessionId,
                    role = MessageRole.USER_ASK.name,
                    text = text.trim(),
                    timestampMillis = System.currentTimeMillis()
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
                            id = UUID.randomUUID().toString(),
                            sessionId = sessionId,
                            role = MessageRole.AI_ANSWER.name,
                            text = result.data.trim(),
                            timestampMillis = System.currentTimeMillis()
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
                    lastUpdatedAtMillis = System.currentTimeMillis()
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
            when (val result = callAi(extraTrailingUserMessage = ScenarioPromptBuilder.endSessionPrompt(currentLanguage()))) {
                is ApiResult.Success -> applyTurn(result.data.copy(sessionComplete = true))
                is ApiResult.Error -> _errorMessage.value = result.message
            }
            _isSending.value = false
        }
    }

    private suspend fun touchSession() {
        session?.let {
            val updated = it.copy(lastUpdatedAtMillis = System.currentTimeMillis())
            dao.updateSession(updated)
            session = updated
        }
    }

    private fun MessageEntity.toDomain() = ChatMessage(
        id = id,
        role = MessageRole.valueOf(role),
        text = text,
        score = score,
        timestampMillis = timestampMillis
    )
}
