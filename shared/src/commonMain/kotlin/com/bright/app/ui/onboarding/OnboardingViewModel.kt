package com.bright.app.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.AnalyticsEvent
import com.bright.app.data.analytics.AnalyticsEvent.OnboardingStep
import com.bright.app.data.analytics.ScenarioLabel
import com.bright.app.data.auth.AuthService
import com.bright.app.data.auth.AuthUser
import com.bright.app.data.auth.SignInResult
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import com.bright.app.util.currentTimeMillis
import com.bright.app.util.randomId
import com.bright.app.util.LocaleUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class OnboardingViewModel(
    private val preferences: UserPreferences,
    private val analytics: Analytics,
    private val dao: ChatDao,
    private val authService: AuthService?
) : ViewModel() {

    /** Sign-in is the primary path now; null on platforms without auth (iOS), where only BYOK shows. */
    val canSignIn: Boolean = authService != null

    val currentUser: StateFlow<AuthUser?> = (authService?.currentUser ?: flowOf(null))
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _isSigningIn = MutableStateFlow(false)
    val isSigningIn: StateFlow<Boolean> = _isSigningIn

    private val _signInError = MutableStateFlow<String?>(null)
    val signInError: StateFlow<String?> = _signInError

    /** Returns true once signed in (or already was). */
    suspend fun signIn(): Boolean {
        val auth = authService ?: return false
        if (currentUser.value != null) return true
        _isSigningIn.value = true
        _signInError.value = null
        val result = auth.signIn()
        _isSigningIn.value = false
        return when (result) {
            SignInResult.Success -> {
                logStep(OnboardingStep.SIGNED_IN)
                true
            }
            SignInResult.Cancelled -> false
            is SignInResult.Failure -> {
                _signInError.value = result.message
                false
            }
        }
    }

    // Picking a language recreates the activity (AppCompatDelegate locale switch), which re-runs
    // the pager's page effect. The ViewModel survives that, so it's the place to de-duplicate.
    private val loggedSteps = mutableSetOf<OnboardingStep>()

    fun logStep(step: OnboardingStep) {
        if (loggedSteps.add(step)) analytics.log(AnalyticsEvent.OnboardingStepReached(step))
    }

    private val _selectedLanguage = MutableStateFlow(Language.fromSystemDefault())
    val selectedLanguage: StateFlow<Language> = _selectedLanguage

    fun selectLanguage(language: Language) {
        _selectedLanguage.value = language
        viewModelScope.launch {
            preferences.setLanguage(language)
            LocaleUtils.applyLanguage(language)
        }
    }

    /**
     * Suspends until everything is written, and the caller navigates only after it returns.
     * This used to be fire-and-forget in viewModelScope, but finishing onboarding pops this
     * screen off the back stack, which clears this ViewModel and cancels its scope — so the
     * writes raced the navigation and onboarding_completed was routinely lost, putting the
     * trainee back through onboarding on the next cold start.
     */
    /**
     * Finishes onboarding and, if [startFirstCase], creates the first session and returns its id
     * so navigation can drop the trainee straight into it. The first case is deliberately fixed
     * and easy — a beginner cardiac arrest, the AI as the patient — because the goal is the first
     * scored answer within a couple of minutes, not choice.
     */
    suspend fun finishOnboarding(apiKey: String, startFirstCase: Boolean): String? {
        finishOnboarding(apiKey)
        if (!startFirstCase) {
            logStep(OnboardingStep.FIRST_CASE_SKIPPED)
            return null
        }
        logStep(OnboardingStep.FIRST_CASE_STARTED)
        val now = currentTimeMillis()
        val id = randomId()
        dao.insertSession(
            SessionEntity(
                id = id,
                scenarioType = FIRST_CASE.name,
                customScenario = null,
                aiRole = AiCharacterRole.PATIENT.name,
                customAiRole = null,
                role = TraineeRole.DOCTOR.name,
                difficulty = Difficulty.BEGINNER.name,
                languageCode = _selectedLanguage.value.code,
                startedAtMillis = now,
                lastUpdatedAtMillis = now,
                isCompleted = false
            )
        )
        analytics.log(
            AnalyticsEvent.SessionStarted(
                scenario = ScenarioLabel.of(FIRST_CASE.name, null),
                difficulty = Difficulty.BEGINNER,
                traineeRole = TraineeRole.DOCTOR,
                source = AnalyticsEvent.SessionSource.ONBOARDING
            )
        )
        return id
    }

    private suspend fun finishOnboarding(apiKey: String) {
        if (apiKey.isNotBlank()) preferences.setGroqApiKey(apiKey)
        // The language page shows _selectedLanguage (defaulted from the system locale) as
        // already selected — a trainee whose device is already in their language has no
        // reason to tap it. But selectLanguage() only ever persists on an explicit tap, so
        // without this, Settings would fall back to Language.fromCode(null) == ENGLISH
        // regardless of what onboarding displayed, even though nothing was ever "wrong".
        preferences.setLanguage(_selectedLanguage.value)
        preferences.setOnboardingCompleted(true)
    }

    private companion object {
        val FIRST_CASE = ScenarioType.CARDIAC_ARREST
    }
}
