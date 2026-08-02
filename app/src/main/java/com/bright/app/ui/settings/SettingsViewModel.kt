package com.bright.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.model.Language
import com.bright.app.util.LocaleUtils
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SettingsUiState(
    val language: Language = Language.ENGLISH,
    val apiKey: String = "",
    val model: String = UserPreferences.DEFAULT_MODEL
)

class SettingsViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences
) : ViewModel() {

    val uiState: StateFlow<SettingsUiState> = combine(
        preferences.languageCode, preferences.groqApiKey, preferences.groqModel
    ) { langCode, apiKey, model ->
        SettingsUiState(
            language = Language.fromCode(langCode),
            apiKey = apiKey.orEmpty(),
            model = model
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())

    fun setLanguage(language: Language) {
        viewModelScope.launch {
            preferences.setLanguage(language)
            LocaleUtils.applyLanguage(language)
        }
    }

    fun setApiKey(key: String) {
        viewModelScope.launch { preferences.setGroqApiKey(key) }
    }

    fun setModel(model: String) {
        viewModelScope.launch { preferences.setGroqModel(model) }
    }

    fun clearAllHistory() {
        viewModelScope.launch { dao.deleteAllSessions() }
    }

    fun resetOnboarding() {
        viewModelScope.launch { preferences.setOnboardingCompleted(false) }
    }
}
