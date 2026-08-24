package com.bright.app.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.bright.app.domain.model.Language
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "bright_prefs")

/**
 * NOTE: the Groq API key is stored in plain DataStore for simplicity (this is a local,
 * single-user personal project with no backend). If you plan to distribute this app
 * publicly, move the key into EncryptedSharedPreferences or the Android Keystore instead.
 */
class UserPreferences(private val context: Context) {

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

    val languageCode: Flow<String?> = context.dataStore.data.map { it[Keys.LANGUAGE_CODE] }

    val onboardingCompleted: Flow<Boolean> = context.dataStore.data.map {
        it[Keys.ONBOARDING_COMPLETED] ?: false
    }

    val homeTourCompleted: Flow<Boolean> = context.dataStore.data.map {
        it[Keys.HOME_TOUR_COMPLETED] ?: false
    }

    val groqApiKey: Flow<String?> = context.dataStore.data.map { it[Keys.GROQ_API_KEY] }

    val groqModel: Flow<String> = context.dataStore.data.map {
        it[Keys.GROQ_MODEL] ?: DEFAULT_MODEL
    }

    suspend fun setLanguage(language: Language) {
        context.dataStore.edit { it[Keys.LANGUAGE_CODE] = language.code }
    }

    suspend fun setOnboardingCompleted(completed: Boolean) {
        context.dataStore.edit { it[Keys.ONBOARDING_COMPLETED] = completed }
    }

    suspend fun setHomeTourCompleted(completed: Boolean) {
        context.dataStore.edit { it[Keys.HOME_TOUR_COMPLETED] = completed }
    }

    suspend fun setGroqApiKey(key: String) {
        context.dataStore.edit { it[Keys.GROQ_API_KEY] = key.trim() }
    }

    suspend fun setGroqModel(model: String) {
        context.dataStore.edit { it[Keys.GROQ_MODEL] = model }
    }
}
