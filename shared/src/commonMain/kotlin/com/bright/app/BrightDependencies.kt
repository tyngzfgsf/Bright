package com.bright.app

import androidx.compose.runtime.staticCompositionLocalOf
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.NoOpAnalytics
import com.bright.app.data.auth.AuthService
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.BillingService
import com.bright.app.data.billing.PaymentLauncher
import com.bright.app.data.local.AppDatabase
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.AiGateway
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.share.ImageSharer
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
    val imageSharer: ImageSharer,
    val notifier: LocalNotifier,
    /** Shown in Settings and used for the Android update check. Supplied per platform. */
    val appVersionName: String,
    /** Null where sideloaded updates don't exist (iOS). See AppUpdater. */
    val appUpdater: AppUpdater? = null,
    /**
     * Null on platforms without an auth implementation yet (iOS) — the Settings account section
     * hides itself rather than showing a button that can't work. See AuthService and
     * BACKEND_PLAN.md Phase 1.
     */
    val authService: AuthService? = null,
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
    val languageChangeRequiresRestart: Boolean = false,
    /** Firebase on Android; a no-op on iOS for now. See Analytics. */
    val analytics: Analytics = NoOpAnalytics,
    /**
     * Null where billing isn't implemented (iOS) — the app then behaves as Free, and the paywall
     * says purchases aren't available on this device. See MONETIZATION.md for why iOS needs
     * StoreKit rather than this Stripe path.
     */
    val billingService: BillingService? = null,
    val paymentLauncher: PaymentLauncher? = null,
    /**
     * ISO country of where the device is (network/SIM, then locale region), for local-currency
     * prices. A function so it's read at purchase time, not frozen at startup.
     */
    val regionCountryCode: () -> String? = { null }
) {
    val billing: BillingRepository by lazy {
        BillingRepository(userPreferences, billingService, paymentLauncher, authService, regionCountryCode)
    }

    val aiGateway: AiGateway by lazy {
        AiGateway(userPreferences, groqRepository, authService, billing)
    }
}

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
