package com.bright.app

import androidx.compose.runtime.staticCompositionLocalOf
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.NoOpAnalytics
import com.bright.app.data.auth.AuthService
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.NoStoreBilling
import com.bright.app.data.billing.StoreBilling
import com.bright.app.data.billing.WorkerApi
import com.bright.app.data.links.ExternalLinks
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
    /** bright-proxy, the Cloudflare Worker behind hosted drills and accounts. Supplied per build. */
    val proxyUrl: String = DEFAULT_PROXY_URL,
    /**
     * In-app purchases through the platform store (Google Play via RevenueCat on Android). Without
     * one, the paywall offers the website (if [webCheckoutUrl] is set) or says purchases aren't
     * available here.
     */
    val storeBilling: StoreBilling = NoStoreBilling,
    /**
     * Website checkout, offered only where store billing isn't available. **Must be null in any
     * build distributed through Google Play or the App Store** — both forbid steering buyers to
     * outside payment for digital subscriptions.
     */
    val webCheckoutUrl: String? = null,
    val externalLinks: ExternalLinks? = null,
    /**
     * ISO country of where the device is (network/SIM, then locale region), for fallback prices
     * before the store's own prices load. A function so it's read when needed, not at startup.
     */
    val regionCountryCode: () -> String? = { null }
) {
    val workerApi: WorkerApi by lazy { WorkerApi(proxyUrl) }

    val billing: BillingRepository by lazy {
        BillingRepository(
            preferences = userPreferences,
            api = workerApi,
            store = storeBilling,
            authService = authService,
            links = externalLinks,
            regionCountryCode = regionCountryCode,
            webCheckoutUrl = webCheckoutUrl,
            webAccountUrl = "$WEBSITE_URL/account"
        )
    }

    val aiGateway: AiGateway by lazy {
        AiGateway(userPreferences, groqRepository, workerApi, authService, billing)
    }

    companion object {
        const val DEFAULT_PROXY_URL = "https://bright-proxy.jchang2032.workers.dev"
        const val WEBSITE_URL = "https://bright-web.jchang2032.workers.dev"
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
