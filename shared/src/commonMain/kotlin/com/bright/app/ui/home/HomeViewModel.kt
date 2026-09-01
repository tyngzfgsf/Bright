package com.bright.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.util.currentTimeMillis
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.local.QuestionRecordEntity
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.data.update.AppUpdater
import com.bright.app.domain.DailyStreak
import com.bright.app.domain.SkillProfile
import com.bright.app.domain.startReviewSession
import com.bright.app.domain.syncLocalNotifications
import com.bright.app.domain.model.TriageSystem
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
import com.bright.app.util.currentLocalEpochDay
import com.bright.app.util.randomId

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
    currentVersionName: String,
    /** Null where sideloaded updates don't exist (iOS) — no badge is shown then. */
    appUpdater: AppUpdater? = null,
    private val notifier: LocalNotifier
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState

    /** The trainee's current weakest scenario type, or null until there's enough data. */
    val weakestStat: StateFlow<SkillProfile.ScenarioStat?> = dao.observeScoredSessions()
        .map { sessions -> SkillProfile.weakestOf(SkillProfile.compute(sessions)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    /** Whether the one-time interactive tour of the Home screen should be showing. */
    val showHomeTour: StateFlow<Boolean> = preferences.homeTourCompleted
        .map { !it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    /** True once a Groq API key is saved. Sessions can't run without one. */
    val hasApiKey: StateFlow<Boolean> = preferences.groqApiKey
        .map { !it.isNullOrBlank() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)

    /** 0 when there's no current streak to show — see [DailyStreak.displayedCount]. */
    val streakDays: StateFlow<Int> = preferences.streakState
        .map { DailyStreak.displayedCount(it, currentLocalEpochDay()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    /** KTAS or ESI, whichever is currently active — see [UserPreferences.triageSystem]. */
    val triageSystem: StateFlow<TriageSystem> = preferences.triageSystem
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TriageSystem.ESI)

    /** The individual missed/low-scored questions due for review right now, most overdue first. */
    val dueForReview: StateFlow<List<QuestionRecordEntity>> = dao.observeDueQuestionRecords(currentTimeMillis())
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** One-tap "Review now": drills the single most-overdue item. Null if nothing is due. */
    suspend fun startNextReviewSession(): String? {
        val record = dueForReview.value.firstOrNull() ?: return null
        return startReviewSession(dao, preferences, record)
    }

    init {
        viewModelScope.launch {
            val update = appUpdater?.checkForUpdate(currentVersionName)
            if (update != null) {
                _uiState.value = _uiState.value.copy(updateAvailable = true)
            }
        }
        // Home is the app's hub — loading it is the closest thing this local-only app has to
        // an "app opened" signal, so it's the natural place to re-derive whether either
        // reminder should be pending (permission may have been granted, a day may have turned
        // over, review schedules may have moved) since the last time anything changed them.
        viewModelScope.launch { syncLocalNotifications(dao, preferences, notifier) }
    }

    fun completeHomeTour() {
        viewModelScope.launch { preferences.setHomeTourCompleted(true) }
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
        val now = currentTimeMillis()
        val id = randomId()

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
