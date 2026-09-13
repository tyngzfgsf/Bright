package com.bright.app.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.model.Language
import com.bright.app.util.LocaleUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class OnboardingViewModel(private val preferences: UserPreferences) : ViewModel() {

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
    suspend fun finishOnboarding(apiKey: String) {
        if (apiKey.isNotBlank()) preferences.setGroqApiKey(apiKey)
        // The language page shows _selectedLanguage (defaulted from the system locale) as
        // already selected — a trainee whose device is already in their language has no
        // reason to tap it. But selectLanguage() only ever persists on an explicit tap, so
        // without this, Settings would fall back to Language.fromCode(null) == ENGLISH
        // regardless of what onboarding displayed, even though nothing was ever "wrong".
        preferences.setLanguage(_selectedLanguage.value)
        preferences.setOnboardingCompleted(true)
    }
}
