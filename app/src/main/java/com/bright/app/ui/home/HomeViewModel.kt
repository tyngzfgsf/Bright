package com.bright.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.UpdateChecker
import com.bright.app.domain.SkillProfile
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

data class HomeUiState(
    val selectedScenario: ScenarioType = ScenarioType.entries.first(),
    val customScenario: String = "",
    val selectedRole: TraineeRole = TraineeRole.DOCTOR,
    val selectedAiRole: AiCharacterRole = AiCharacterRole.RANDOM,
    val customAiRole: String = "",
    val difficultyIndex: Int = 1,
    val isStarting: Boolean = false,
    val updateAvailable: Boolean = false
)

class HomeViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    currentVersionName: String
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState

    /** The trainee's current weakest scenario type, or null until there's enough data. */
    val weakestStat: StateFlow<SkillProfile.ScenarioStat?> = dao.observeScoredSessions()
        .map { sessions -> SkillProfile.weakestOf(SkillProfile.compute(sessions)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    init {
        viewModelScope.launch {
            val update = UpdateChecker.checkForUpdate(currentVersionName)
            if (update != null) {
                _uiState.value = _uiState.value.copy(updateAvailable = true)
            }
        }
    }

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

    suspend fun startSession(): String = startSessionInternal(_uiState.value.selectedScenario, _uiState.value.customScenario)

    /**
     * One-tap weak-spot drill: starts a session on the given scenario type directly,
     * ignoring whatever is selected in the grid, using the user's current role/difficulty.
     */
    suspend fun startWeakSpotSession(type: ScenarioType): String = startSessionInternal(type, customScenarioOverride = "")

    private suspend fun startSessionInternal(scenario: ScenarioType, customScenarioOverride: String): String {
        val state = _uiState.value
        val difficulty = Difficulty.entries.getOrElse(state.difficultyIndex) { Difficulty.INTERMEDIATE }
        val languageCode = preferences.languageCode.first() ?: Language.fromSystemDefault().code
        val now = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()

        val trimmedCustomScenario = customScenarioOverride.trim()
        val trimmedCustomAiRole = state.customAiRole.trim()

        val resolvedAiRole = if (state.selectedAiRole == AiCharacterRole.RANDOM) {
            if (kotlin.random.Random.nextBoolean()) AiCharacterRole.PATIENT else AiCharacterRole.DOCTOR
        } else {
            state.selectedAiRole
        }

        dao.insertSession(
            SessionEntity(
                id = id,
                scenarioType = if (trimmedCustomScenario.isBlank()) scenario.name else null,
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
