package com.bright.app.data.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.bright.app.domain.model.Language
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * NOTE: the Groq API key is stored in plain DataStore for simplicity (this is a local,
 * single-user personal project with no backend). If you plan to distribute this app
 * publicly, move the key into EncryptedSharedPreferences/Keychain instead.
 *
 * Takes an already-built [DataStore] rather than a platform Context — actually opening the
 * on-disk store (deciding *where* the file lives) is a per-platform concern and happens at
 * each platform's app-entry-point instead (see `BrightApplication.kt` on Android).
 */
class UserPreferences(private val dataStore: DataStore<Preferences>) {

    private object Keys {
        val LANGUAGE_CODE = stringPreferencesKey("language_code")
        val ONBOARDING_COMPLETED = booleanPreferencesKey("onboarding_completed")
        val HOME_TOUR_COMPLETED = booleanPreferencesKey("home_tour_completed")
        val GROQ_API_KEY = stringPreferencesKey("groq_api_key")
        val GROQ_MODEL = stringPreferencesKey("groq_model")
    }

    companion object {
        const val DEFAULT_MODEL = "openai/gpt-oss-120b"
    }

    val languageCode: Flow<String?> = dataStore.data.map { it[Keys.LANGUAGE_CODE] }

    val onboardingCompleted: Flow<Boolean> = dataStore.data.map {
        it[Keys.ONBOARDING_COMPLETED] ?: false
    }

    val homeTourCompleted: Flow<Boolean> = dataStore.data.map {
        it[Keys.HOME_TOUR_COMPLETED] ?: false
    }

    val groqApiKey: Flow<String?> = dataStore.data.map { it[Keys.GROQ_API_KEY] }

    val groqModel: Flow<String> = dataStore.data.map {
        it[Keys.GROQ_MODEL] ?: DEFAULT_MODEL
    }

    suspend fun setLanguage(language: Language) {
        dataStore.edit { it[Keys.LANGUAGE_CODE] = language.code }
    }

    suspend fun setOnboardingCompleted(completed: Boolean) {
        dataStore.edit { it[Keys.ONBOARDING_COMPLETED] = completed }
    }

    suspend fun setHomeTourCompleted(completed: Boolean) {
        dataStore.edit { it[Keys.HOME_TOUR_COMPLETED] = completed }
    }

    suspend fun setGroqApiKey(key: String) {
        dataStore.edit { it[Keys.GROQ_API_KEY] = key.trim() }
    }

    suspend fun setGroqModel(model: String) {
        dataStore.edit { it[Keys.GROQ_MODEL] = model }
    }
}
