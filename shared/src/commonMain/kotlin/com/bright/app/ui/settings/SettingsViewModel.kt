package com.bright.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.AnalyticsEvent
import com.bright.app.data.analytics.NoOpAnalytics
import com.bright.app.data.local.ChatDao
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.remote.GroqUsageInfo
import com.bright.app.data.update.AppUpdateInfo
import com.bright.app.data.update.AppUpdater
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TriageSystem
import com.bright.app.util.ApiResult
import com.bright.app.util.LocaleUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SettingsUiState(
    val language: Language = Language.ENGLISH,
    val apiKey: String = "",
    val model: String = UserPreferences.DEFAULT_MODEL,
    val updateInfo: AppUpdateInfo? = null,
    val triageSystem: TriageSystem = TriageSystem.ESI
)

class SettingsViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    private val groqRepository: GroqRepository,
    private val currentVersionName: String,
    /** Null on platforms without sideloaded updates (iOS); the UI hides the section then. */
    private val appUpdater: AppUpdater? = null,
    private val analytics: Analytics = NoOpAnalytics
) : ViewModel() {

    private val _updateInfo = MutableStateFlow<AppUpdateInfo?>(null)
    private val _isDownloadingUpdate = MutableStateFlow(false)
    private val _updateErrorMessage = MutableStateFlow<String?>(null)

    val isDownloadingUpdate: StateFlow<Boolean> = _isDownloadingUpdate
    val updateErrorMessage: StateFlow<String?> = _updateErrorMessage

    private val _availableModels = MutableStateFlow<List<String>>(emptyList())
    private val _isFetchingModels = MutableStateFlow(false)
    private val _modelsFetchError = MutableStateFlow<String?>(null)
    private val _usage = MutableStateFlow<GroqUsageInfo?>(null)

    val availableModels: StateFlow<List<String>> = _availableModels
    val isFetchingModels: StateFlow<Boolean> = _isFetchingModels
    val modelsFetchError: StateFlow<String?> = _modelsFetchError
    val usage: StateFlow<GroqUsageInfo?> = _usage

    val uiState: StateFlow<SettingsUiState> = combine(
        preferences.languageCode, preferences.groqApiKey, preferences.groqModel, _updateInfo, preferences.triageSystem
    ) { langCode, apiKey, model, updateInfo, triageSystem ->
        SettingsUiState(
            language = Language.fromCode(langCode),
            apiKey = apiKey.orEmpty(),
            model = model,
            updateInfo = updateInfo,
            triageSystem = triageSystem
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())

    init {
        viewModelScope.launch {
            _updateInfo.value = appUpdater?.checkForUpdate(currentVersionName)
        }
        viewModelScope.launch {
            val existingKey = preferences.groqApiKey.first()
            if (!existingKey.isNullOrBlank()) {
                fetchModelsAndUsage()
            }
        }
    }

    fun setLanguage(language: Language) {
        viewModelScope.launch {
            preferences.setLanguage(language)
            LocaleUtils.applyLanguage(language)
        }
    }

    fun setTriageSystem(system: TriageSystem) {
        viewModelScope.launch { preferences.setTriageSystem(system) }
    }

    fun setApiKey(key: String) {
        viewModelScope.launch {
            val previous = preferences.groqApiKey.first().orEmpty()
            preferences.setGroqApiKey(key)
            // Only a real change counts: clearing the key or re-saving the same one isn't "added".
            // The event carries whether a key was replaced, never the key.
            val trimmed = key.trim()
            if (trimmed.isNotEmpty() && trimmed != previous) {
                analytics.log(AnalyticsEvent.SettingsKeyAdded(replacedExistingKey = previous.isNotEmpty()))
            }
            fetchModelsAndUsage()
        }
    }

    fun setModel(model: String) {
        viewModelScope.launch { preferences.setGroqModel(model) }
    }

    /** Fetches the current key's available chat models and this-minute rate-limit usage. */
    fun fetchModelsAndUsage() {
        viewModelScope.launch {
            val key = preferences.groqApiKey.first().orEmpty()
            if (key.isBlank()) {
                _modelsFetchError.value = null
                _availableModels.value = emptyList()
                _usage.value = null
                return@launch
            }
            _isFetchingModels.value = true
            _modelsFetchError.value = null
            when (val result = groqRepository.fetchModelsAndUsage(key)) {
                is ApiResult.Success -> {
                    _availableModels.value = result.data.models
                    _usage.value = result.data.usage
                }
                is ApiResult.Error -> {
                    _modelsFetchError.value = result.message
                }
            }
            _isFetchingModels.value = false
        }
    }

    fun clearAllHistory() {
        viewModelScope.launch { dao.deleteAllSessions() }
    }

    fun resetOnboarding() {
        viewModelScope.launch {
            preferences.setOnboardingCompleted(false)
            preferences.setHomeTourCompleted(false)
        }
    }

    fun downloadAndInstallUpdate() {
        val update = _updateInfo.value ?: return
        val updater = appUpdater ?: return
        viewModelScope.launch {
            _isDownloadingUpdate.value = true
            _updateErrorMessage.value = null
            val error = updater.downloadAndInstall(update)
            _isDownloadingUpdate.value = false
            _updateErrorMessage.value = error
        }
    }
}
