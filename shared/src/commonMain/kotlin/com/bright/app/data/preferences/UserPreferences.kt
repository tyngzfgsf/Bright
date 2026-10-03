package com.bright.app.data.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.bright.app.domain.DailyStreak
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TriageSystem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

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
        val CACHED_ENTITLEMENT = stringPreferencesKey("cached_entitlement")
        val ACTIVE_HOSTED_DRILL = stringPreferencesKey("active_hosted_drill")
        val STREAK_FREEZES_USED = intPreferencesKey("streak_freezes_used")
    }

    private val entitlementJson = Json { ignoreUnknownKeys = true }

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

    /**
     * Call once when a session actually completes — see [DailyStreak.recordActiveDay].
     * Returns whether this call actually incremented the streak (a genuine new active day),
     * as opposed to a same-day no-op — callers use this to gate a "milestone reached" signal
     * without having to diff the streak count across recompositions themselves.
     */
    suspend fun recordActiveDay(todayEpochDay: Long): Boolean {
        var incremented = false
        dataStore.edit { prefs ->
            val previous = DailyStreak.State(
                count = prefs[Keys.STREAK_COUNT] ?: 0,
                lastActiveEpochDay = prefs[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] ?: 0L
            )
            val updated = DailyStreak.recordActiveDay(previous, todayEpochDay)
            incremented = updated.count > previous.count
            prefs[Keys.STREAK_COUNT] = updated.count
            prefs[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] = updated.lastActiveEpochDay
        }
        return incremented
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

    /**
     * Last plan/usage the backend reported — see `BillingRepository`. A display cache only: the
     * server re-checks the plan on every hosted drill, so editing this unlocks nothing billable.
     */
    val cachedEntitlement: Flow<Entitlement> = dataStore.data.map { prefs ->
        prefs[Keys.CACHED_ENTITLEMENT]
            ?.let { runCatching { entitlementJson.decodeFromString<Entitlement>(it) }.getOrNull() }
            ?: Entitlement()
    }

    suspend fun setCachedEntitlement(entitlement: Entitlement) {
        dataStore.edit { it[Keys.CACHED_ENTITLEMENT] = entitlementJson.encodeToString(entitlement) }
    }

    /**
     * The hosted drill ticket for the session currently being played, as (sessionId, drillId).
     * Persisted so leaving and re-opening the same session doesn't spend a second drill. Only the
     * latest is kept: an older session re-opened later gets a new ticket, which is fair — it's a
     * new sitting.
     */
    val activeHostedDrill: Flow<Pair<String, String>?> = dataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_HOSTED_DRILL]?.split('|')?.takeIf { it.size == 2 }?.let { it[0] to it[1] }
    }

    suspend fun setActiveHostedDrill(sessionId: String, drillId: String) {
        dataStore.edit { it[Keys.ACTIVE_HOSTED_DRILL] = "$sessionId|$drillId" }
    }

    suspend fun clearActiveHostedDrill() {
        dataStore.edit { it.remove(Keys.ACTIVE_HOSTED_DRILL) }
    }

    /** Freezes spent on this device. Available = server-granted total minus this. */
    val streakFreezesUsed: Flow<Int> = dataStore.data.map { it[Keys.STREAK_FREEZES_USED] ?: 0 }

    /**
     * [recordActiveDay], spending streak freezes to bridge missed days when there are enough —
     * see [DailyStreak.recordActiveDayWithFreezes]. Same return contract.
     */
    suspend fun recordActiveDay(todayEpochDay: Long, freezesAvailable: Int): Boolean {
        var incremented = false
        dataStore.edit { prefs ->
            val previous = DailyStreak.State(
                count = prefs[Keys.STREAK_COUNT] ?: 0,
                lastActiveEpochDay = prefs[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] ?: 0L
            )
            val result = DailyStreak.recordActiveDayWithFreezes(previous, todayEpochDay, freezesAvailable)
            incremented = result.state.count > previous.count
            prefs[Keys.STREAK_COUNT] = result.state.count
            prefs[Keys.STREAK_LAST_ACTIVE_EPOCH_DAY] = result.state.lastActiveEpochDay
            if (result.freezesConsumed > 0) {
                prefs[Keys.STREAK_FREEZES_USED] = (prefs[Keys.STREAK_FREEZES_USED] ?: 0) + result.freezesConsumed
            }
        }
        return incremented
    }
}
