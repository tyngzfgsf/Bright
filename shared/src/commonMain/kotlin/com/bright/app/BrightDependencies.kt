package com.bright.app

import androidx.compose.runtime.staticCompositionLocalOf
import com.bright.app.data.local.AppDatabase
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.update.AppUpdater

/**
 * Everything the screens need, in one platform-neutral bag.
 *
 * This replaces `LocalContext.current.applicationContext as BrightApplication`, which was the
 * second of the two gates keeping Bright's screens out of `commonMain` (see Phase 5 in
 * IOS_MIGRATION_PLAN.md): that cast needs an Android `Context` and an Android `Application`
 * subclass, neither of which exists on iOS.
 *
 * Deliberately a plain class rather than `expect`/`actual`: constructing it needs different
 * inputs per platform (Android's database and DataStore builders both take a `Context`; iOS's
 * take nothing), and `expect`/`actual` requires identical constructor signatures. Same reasoning
 * as the Phase 4 voice engines — each platform's entry point builds one and provides it.
 */
class BrightDependencies(
    val database: AppDatabase,
    val userPreferences: UserPreferences,
    val groqRepository: GroqRepository,
    /** Shown in Settings and used for the Android update check. Supplied per platform. */
    val appVersionName: String,
    /** Null where sideloaded updates don't exist (iOS). See AppUpdater. */
    val appUpdater: AppUpdater? = null,
    /**
     * True where a language change only takes effect on next launch, so the UI can say so
     * instead of appearing to do nothing.
     *
     * Android switches live via AppCompatDelegate. iOS cannot: Compose Resources resolves
     * strings against the system locale, and the API for overriding that
     * (`LocalComposeEnvironment` / `ResourceEnvironment`) is `internal` in every Compose
     * Multiplatform release compatible with this project's Kotlin version — verified against
     * both 1.8.2 and 1.9.3. Live in-app switching is possible on iOS in general (a custom
     * string layer, or SwiftUI's `.environment(\.locale)`), just not through Compose
     * Resources' public API today. See JetBrains/compose-multiplatform#4197.
     */
    val languageChangeRequiresRestart: Boolean = false
)

/**
 * `staticCompositionLocalOf` rather than `compositionLocalOf`: these dependencies are set once
 * at startup and never change, so there is no reason to pay for reads being tracked as
 * recomposition dependencies.
 */
val LocalBrightDependencies = staticCompositionLocalOf<BrightDependencies> {
    error(
        "No BrightDependencies provided. Wrap the UI in " +
            "CompositionLocalProvider(LocalBrightDependencies provides ...) at the platform entry point."
    )
}
