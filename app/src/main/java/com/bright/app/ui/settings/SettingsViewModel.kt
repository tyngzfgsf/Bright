package com.bright.app.ui.settings

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.R
import com.bright.app.data.local.ChatDao
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.ApkDownloader
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.remote.GroqUsageInfo
import com.bright.app.data.remote.UpdateChecker
import com.bright.app.domain.model.Language
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
    val updateInfo: UpdateChecker.UpdateInfo? = null
)

class SettingsViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    private val groqRepository: GroqRepository,
    private val currentVersionName: String
) : ViewModel() {

    private val _updateInfo = MutableStateFlow<UpdateChecker.UpdateInfo?>(null)
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
        preferences.languageCode, preferences.groqApiKey, preferences.groqModel, _updateInfo
    ) { langCode, apiKey, model, updateInfo ->
        SettingsUiState(
            language = Language.fromCode(langCode),
            apiKey = apiKey.orEmpty(),
            model = model,
            updateInfo = updateInfo
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())

    init {
        viewModelScope.launch {
            _updateInfo.value = UpdateChecker.checkForUpdate(currentVersionName)
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

    fun setApiKey(key: String) {
        viewModelScope.launch {
            preferences.setGroqApiKey(key)
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
        viewModelScope.launch { preferences.setOnboardingCompleted(false) }
    }

    fun downloadAndInstallUpdate(context: Context) {
        val update = _updateInfo.value ?: return
        val apkUrl = update.apkDownloadUrl
        val appContext = context.applicationContext
        if (apkUrl == null) {
            _updateErrorMessage.value = appContext.getString(R.string.settings_update_no_apk)
            return
        }

        if (!appContext.packageManager.canRequestPackageInstalls()) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${appContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            appContext.startActivity(intent)
            return
        }

        viewModelScope.launch {
            _isDownloadingUpdate.value = true
            _updateErrorMessage.value = null
            val file = ApkDownloader.download(appContext, apkUrl)
            _isDownloadingUpdate.value = false
            if (file != null) {
                ApkDownloader.launchInstall(appContext, file)
            } else {
                _updateErrorMessage.value = appContext.getString(R.string.settings_update_download_failed)
            }
        }
    }
}
