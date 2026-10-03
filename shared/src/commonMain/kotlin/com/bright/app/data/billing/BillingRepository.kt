package com.bright.app.data.billing

import com.bright.app.data.auth.AuthService
import com.bright.app.data.links.ExternalLinks
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.BillingSource
import com.bright.app.domain.billing.Currency
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.PlanId
import com.bright.app.domain.model.Language
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Why the paywall opened — changes its headline, and is what analytics would segment on. */
enum class PaywallReason { BROWSE, DRILL_LIMIT, CUSTOM_SCENARIO, EXPERT_DEBRIEF, ONBOARDING }

sealed interface PurchaseResult {
    data object Success : PurchaseResult
    data object Canceled : PurchaseResult
    data object SignInRequired : PurchaseResult
    data object Unavailable : PurchaseResult
    data class Failed(val message: String) : PurchaseResult

    /** Paid, but the backend hasn't heard from the store yet. The plan shows up on the next refresh. */
    data object Pending : PurchaseResult
}

sealed interface CancelResult {
    data class Done(val entitlement: Entitlement) : CancelResult
    data object OfferApplied : CancelResult

    /** A store plan: cancelling happens in Google Play / App Store settings, which were opened. */
    data object OpenedStore : CancelResult

    /** The trainee backed out of the store's confirmation sheet. Nothing to say. */
    data object Dismissed : CancelResult
    data class Failed(val message: String) : CancelResult
}

/**
 * The app's single view of the trainee's plan, and every purchase flow.
 *
 * Plans can come from three places — Google Play, the App Store (both through [StoreBilling])
 * and the website (Paddle) — and the backend merges them into one [Entitlement] per account.
 * This class only ever *reads* that; buying something means: store sheet → RevenueCat → webhook
 * → bright-proxy → [refresh]. The cached copy in DataStore is for display and offline use; the
 * backend re-checks the plan on every hosted drill, so a tampered cache unlocks nothing.
 */
class BillingRepository(
    private val preferences: UserPreferences,
    private val api: WorkerApi,
    private val store: StoreBilling,
    private val authService: AuthService?,
    private val links: ExternalLinks?,
    private val regionCountryCode: () -> String?,
    /** Website checkout, for builds not distributed through an app store. Null in store builds. */
    private val webCheckoutUrl: String?,
    /** Where website subscribers manage billing. */
    private val webAccountUrl: String
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val entitlement: StateFlow<Entitlement> = preferences.cachedEntitlement
        .stateIn(scope, SharingStarted.Eagerly, Entitlement())

    private val _storePrices = MutableStateFlow<Map<String, StorePrice>>(emptyMap())
    /** The stores' own formatted prices, keyed like Pricing.lookupKey / AddOn.lookupKey. Empty until loaded. */
    val storePrices: StateFlow<Map<String, StorePrice>> = _storePrices

    /** True when drills run on the backend (signed in, no own key). Metering only applies then. */
    val isHosted: Flow<Boolean> = combine(
        preferences.groqApiKey,
        authService?.currentUser ?: flowOf(null)
    ) { key, user -> key.isNullOrBlank() && user != null }.distinctUntilChanged()

    /** Streak freezes still available: granted by the backend minus spent on this device. */
    val streakFreezesAvailable: Flow<Int> = combine(entitlement, preferences.streakFreezesUsed) { e, used ->
        (e.streakFreezesGranted - used).coerceAtLeast(0)
    }

    /** Google Play / App Store purchases work in this build. */
    val canPurchaseInApp: Boolean get() = store.isAvailable

    /** No store here, but this build may send people to the website to buy. */
    val canPurchaseOnWeb: Boolean get() = !store.isAvailable && webCheckoutUrl != null && links != null

    /** For the fallback prices shown before (or without) store prices. */
    val currency: Currency get() = Currency.forCountry(regionCountryCode())

    init {
        scope.launch {
            authService?.currentUser?.map { it?.uid }?.distinctUntilChanged()?.collect { uid ->
                if (uid == null) {
                    store.logOut()
                    preferences.setCachedEntitlement(Entitlement())
                } else {
                    store.logIn(uid)
                    refresh()
                }
            }
        }
        scope.launch { _storePrices.value = store.prices() }
    }

    suspend fun refresh(): Entitlement {
        val token = authService?.idToken() ?: return entitlement.value
        val locale = Language.fromCode(preferences.languageCode.first()).code
        return when (val result = api.account(token, locale)) {
            is BillingResult.Success -> result.data.also { preferences.setCachedEntitlement(it) }
            else -> entitlement.value
        }
    }

    /**
     * Buys a plan in the store, then any add-ons ticked at checkout. The stores can't bundle a
     * one-off purchase into a subscription, so each add-on is its own short confirmation — but
     * the trainee chose them on one screen.
     */
    suspend fun subscribe(plan: PlanId, period: BillingPeriod, addOns: List<AddOn>): PurchaseResult {
        if (authService?.idToken() == null) return PurchaseResult.SignInRequired
        val before = entitlement.value
        when (val outcome = store.purchasePlan(plan, period)) {
            StoreOutcome.Completed -> Unit
            else -> return outcome.toPurchaseResult()
        }
        addOns.forEach { store.purchaseAddOn(it) }
        return awaitBackend { it.effectivePlan == plan && it != before }
    }

    suspend fun buyAddOn(addOn: AddOn): PurchaseResult {
        if (authService?.idToken() == null) return PurchaseResult.SignInRequired
        val before = entitlement.value
        return when (val outcome = store.purchaseAddOn(addOn)) {
            StoreOutcome.Completed -> awaitBackend {
                it.bonusDrills > before.bonusDrills || it.streakFreezesGranted > before.streakFreezesGranted
            }
            else -> outcome.toPurchaseResult()
        }
    }

    /** Only offered where [canPurchaseOnWeb] — never in a build that came from an app store. */
    fun openWebCheckout() {
        webCheckoutUrl?.let { links?.open(it) }
    }

    /** "Restore purchases" — Apple requires the button; it's also how a reinstall finds a store plan. */
    suspend fun restore(): PurchaseResult = when (val outcome = store.restore()) {
        StoreOutcome.Completed -> awaitBackend { it.hasPaidAccess }
        else -> outcome.toPurchaseResult()
    }

    /**
     * Cancel, or take the exit offer instead. Website plans are handled by the backend directly,
     * from any device. Store plans: the offer is bought through the store's own discount
     * mechanism, and a plain cancel has to happen in the store's settings — Apple and Google
     * don't let apps cancel subscriptions themselves.
     */
    suspend fun cancel(acceptRetentionOffer: Boolean): CancelResult {
        val token = authService?.idToken() ?: return CancelResult.Failed(SIGN_IN)
        val e = entitlement.value
        if (e.source == BillingSource.WEB) {
            return when (val r = api.cancelWebSubscription(token, acceptRetentionOffer)) {
                is BillingResult.Success -> {
                    preferences.setCachedEntitlement(r.data)
                    if (acceptRetentionOffer) CancelResult.OfferApplied else CancelResult.Done(r.data)
                }
                is BillingResult.Failure -> CancelResult.Failed(r.message)
                BillingResult.SignedOut -> CancelResult.Failed(SIGN_IN)
            }
        }
        if (!acceptRetentionOffer) return openStoreManagement()
        return when (val outcome = store.purchaseRetentionOffer(e.effectivePlan, e.period ?: BillingPeriod.MONTHLY)) {
            StoreOutcome.Completed -> {
                (api.markRetentionOfferUsed(token) as? BillingResult.Success)?.let { preferences.setCachedEntitlement(it.data) }
                CancelResult.OfferApplied
            }
            StoreOutcome.Canceled -> CancelResult.Dismissed
            // Offer not configured in this store: don't strand them — let them cancel normally.
            StoreOutcome.Unavailable -> openStoreManagement()
            is StoreOutcome.Failed -> CancelResult.Failed(outcome.message)
        }
    }

    suspend fun resume(): CancelResult {
        val e = entitlement.value
        if (e.source != BillingSource.WEB) return openStoreManagement()
        val token = authService?.idToken() ?: return CancelResult.Failed(SIGN_IN)
        return when (val r = api.resumeWebSubscription(token)) {
            is BillingResult.Success -> CancelResult.Done(r.data).also { preferences.setCachedEntitlement(r.data) }
            is BillingResult.Failure -> CancelResult.Failed(r.message)
            BillingResult.SignedOut -> CancelResult.Failed(SIGN_IN)
        }
    }

    /**
     * Dunning, trainee side: send them where the card can be fixed right now instead of waiting
     * for the next automatic retry — the store's own page, or the website for Paddle plans.
     */
    fun fixFailedPayment() {
        val e = entitlement.value
        val url = if (e.source == BillingSource.WEB) webAccountUrl else e.managementUrl ?: storeFallbackUrl(e.source)
        url?.let { links?.open(it) }
    }

    private fun openStoreManagement(): CancelResult {
        val e = entitlement.value
        val url = e.managementUrl ?: storeFallbackUrl(e.source) ?: return CancelResult.Failed("")
        val opener = links ?: return CancelResult.Failed("")
        opener.open(url)
        return CancelResult.OpenedStore
    }

    private fun storeFallbackUrl(source: BillingSource?): String? = when (source) {
        BillingSource.PLAY_STORE -> "https://play.google.com/store/account/subscriptions"
        BillingSource.APP_STORE -> "https://apps.apple.com/account/subscriptions"
        else -> null
    }

    /**
     * Stores confirm a purchase to the app before RevenueCat's webhook reaches the backend, so
     * the plan usually lags by a second or two; polling briefly lets the paywall close onto the
     * new plan rather than a stale "Free".
     */
    private suspend fun awaitBackend(isReflected: (Entitlement) -> Boolean): PurchaseResult {
        repeat(CONFIRM_POLL_ATTEMPTS) { attempt ->
            if (isReflected(refresh())) return PurchaseResult.Success
            delay(CONFIRM_POLL_BASE_MS * (attempt + 1))
        }
        return PurchaseResult.Pending
    }

    private fun StoreOutcome.toPurchaseResult(): PurchaseResult = when (this) {
        StoreOutcome.Completed -> PurchaseResult.Success
        StoreOutcome.Canceled -> PurchaseResult.Canceled
        StoreOutcome.Unavailable -> PurchaseResult.Unavailable
        is StoreOutcome.Failed -> PurchaseResult.Failed(message)
    }

    private companion object {
        const val SIGN_IN = "Sign in first."
        const val CONFIRM_POLL_ATTEMPTS = 6
        const val CONFIRM_POLL_BASE_MS = 700L
    }
}
