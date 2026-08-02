package com.bright.app.ui.home

import androidx.lifecycle.ViewModel
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import java.util.UUID

data class HomeUiState(
    val selectedScenario: ScenarioType = ScenarioType.entries.first(),
    val customScenario: String = "",
    val selectedRole: TraineeRole = TraineeRole.DOCTOR,
    val selectedAiRole: AiCharacterRole = AiCharacterRole.RANDOM,
    val customAiRole: String = "",
    val difficultyIndex: Int = 1, // 0=Beginner, 1=Intermediate, 2=Advanced
    val isStarting: Boolean = false
)

class HomeViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState

    fun selectScenario(scenario: ScenarioType) {
        _uiState.value = _uiState.value.copy(selectedScenario = scenario, customScenario = "")
    }

    fun setCustomScenario(text: String) {
        _uiState.value = _uiState.value.copy(customScenario = text)
    }

    fun selectRole(role: TraineeRole) {
        _uiState.value = _uiState.value.copy(selectedRole = role)
    }

    fun selectAiRole(role: AiCharacterRole) {
        _uiState.value = _uiState.value.copy(selectedAiRole = role, customAiRole = "")
    }

    fun setCustomAiRole(text: String) {
        _uiState.value = _uiState.value.copy(customAiRole = text)
    }

    fun setDifficultyIndex(index: Int) {
        _uiState.value = _uiState.value.copy(difficultyIndex = index)
    }

    fun pickRandomScenario() {
        _uiState.value = _uiState.value.copy(
            selectedScenario = ScenarioType.entries.random(),
            customScenario = ""
        )
    }

    /** Creates a new session row and returns its id so the caller can navigate to Chat. */
    suspend fun startSession(): String {
        val state = _uiState.value
        val difficulty = Difficulty.entries.getOrElse(state.difficultyIndex) { Difficulty.INTERMEDIATE }
        val languageCode = preferences.languageCode.first() ?: Language.fromSystemDefault().code
        val now = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()

        val trimmedCustomScenario = state.customScenario.trim()
        val trimmedCustomAiRole = state.customAiRole.trim()

        // RANDOM is resolved once here and stored, so it doesn't re-roll on every AI request.
        val resolvedAiRole = if (state.selectedAiRole == AiCharacterRole.RANDOM) {
            if (kotlin.random.Random.nextBoolean()) AiCharacterRole.PATIENT else AiCharacterRole.DOCTOR
        } else {
            state.selectedAiRole
        }

        dao.insertSession(
            SessionEntity(
                id = id,
                scenarioType = if (trimmedCustomScenario.isBlank()) state.selectedScenario.name else null,
                customScenario = trimmedCustomScenario.ifBlank { null },
                aiRole = resolvedAiRole.name,
                customAiRole = trimmedCustomAiRole.ifBlank { null },
                role = state.selectedRole.name,
                difficulty = difficulty.name,
                languageCode = languageCode,
                startedAtMillis = now,
                lastUpdatedAtMillis = now,
                isCompleted = false
            )
        )
        return id
    }
}
