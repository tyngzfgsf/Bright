package com.bright.app.data.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.bright.app.domain.DailyStreak
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TriageSystem
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
        val STREAK_COUNT = intPreferencesKey("streak_count")
        val STREAK_LAST_ACTIVE_EPOCH_DAY = longPreferencesKey("streak_last_active_epoch_day")
        val TRIAGE_SYSTEM_OVERRIDE = stringPreferencesKey("triage_system_override")
        val NOTIFICATION_PERMISSION_ASKED = booleanPreferencesKey("notification_permission_asked")
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

    val streakState: Flow<DailyStreak.State> = dataStore.data.map {
        DailyStreak.State(
            count = it[Keys.STREAK_COUNT] ?: 0,
            lastActiveEpochDay = it[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] ?: 0L
        )
    }

    /** Call once when a session actually completes — see [DailyStreak.recordActiveDay]. */
    suspend fun recordActiveDay(todayEpochDay: Long) {
        dataStore.edit { prefs ->
            val previous = DailyStreak.State(
                count = prefs[Keys.STREAK_COUNT] ?: 0,
                lastActiveEpochDay = prefs[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] ?: 0L
            )
            val updated = DailyStreak.recordActiveDay(previous, todayEpochDay)
            prefs[Keys.STREAK_COUNT] = updated.count
            prefs[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] = updated.lastActiveEpochDay
        }
    }

    /**
     * KTAS for Korean, ESI otherwise, unless the trainee has explicitly picked one in Settings
     * — see [TriageSystem.defaultFor]. Reactive to the language preference for as long as no
     * override has ever been set, so switching languages before ever touching this setting
     * still picks the right default.
     */
    val triageSystem: Flow<TriageSystem> = dataStore.data.map { prefs ->
        val override = prefs[Keys.TRIAGE_SYSTEM_OVERRIDE]?.let { stored ->
            runCatching { TriageSystem.valueOf(stored) }.getOrNull()
        }
        override ?: TriageSystem.defaultFor(Language.fromCode(prefs[Keys.LANGUAGE_CODE]))
    }

    suspend fun setTriageSystem(system: TriageSystem) {
        dataStore.edit { it[Keys.TRIAGE_SYSTEM_OVERRIDE] = system.name }
    }

    /**
     * Whether we've ever asked for notification permission — gates the one-time prompt so it
     * only ever shows once, triggered at a natural moment (first completed session) rather than
     * on first launch. See `ChatViewModel`/`ChatScreen`.
     */
    val notificationPermissionAsked: Flow<Boolean> = dataStore.data.map {
        it[Keys.NOTIFICATION_PERMISSION_ASKED] ?: false
    }

    suspend fun setNotificationPermissionAsked(asked: Boolean) {
        dataStore.edit { it[Keys.NOTIFICATION_PERMISSION_ASKED] = asked }
    }
}
