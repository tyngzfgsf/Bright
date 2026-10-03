package com.bright.app.data.billing

import com.bright.app.data.auth.AuthService
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.Currency
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.PlanId
import com.bright.app.domain.model.Language
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Why the paywall opened — changes its headline, and is what analytics would segment on. */
enum class PaywallReason { BROWSE, DRILL_LIMIT, CUSTOM_SCENARIO, EXPERT_DEBRIEF, ONBOARDING }

sealed interface PurchaseResult {
    data object Success : PurchaseResult
    data object Canceled : PurchaseResult
    data object SignInRequired : PurchaseResult
    data class Failed(val message: String) : PurchaseResult

    /** Paid, but the webhook hasn't landed yet. The plan will show up on the next refresh. */
    data object Pending : PurchaseResult
}

/**
 * The app's single view of the trainee's plan, and the orchestration of every purchase flow
 * (server call → payment sheet → wait for the webhook to confirm).
 *
 * The [Entitlement] is cached in DataStore so the plan survives offline cold starts. The cache
 * is a convenience for the UI only — the server re-checks the plan on every drill and every
 * model call, so a tampered cache unlocks nothing that costs money.
 *
 * [service] and [paymentLauncher] are null on platforms without billing (iOS today); the
 * repository then just reports the Free plan and every purchase fails politely.
 */
class BillingRepository(
    private val preferences: UserPreferences,
    private val service: BillingService?,
    private val paymentLauncher: PaymentLauncher?,
    private val authService: AuthService?,
    private val regionCountryCode: () -> String?
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val entitlement: StateFlow<Entitlement> = preferences.cachedEntitlement
        .stateIn(scope, SharingStarted.Eagerly, Entitlement())

    /** True when drills run on the backend (signed in, no own key). Metering only applies then. */
    val isHosted: Flow<Boolean> = combine(
        preferences.groqApiKey,
        authService?.currentUser ?: kotlinx.coroutines.flow.flowOf(null)
    ) { key, user -> key.isNullOrBlank() && user != null }.distinctUntilChanged()

    /** Streak freezes still available: granted by the server minus spent on this device. */
    val streakFreezesAvailable: Flow<Int> = combine(entitlement, preferences.streakFreezesUsed) { e, used ->
        (e.streakFreezesGranted - used).coerceAtLeast(0)
    }

    val isPurchasingAvailable: Boolean get() = service != null && paymentLauncher?.isAvailable == true

    /** Shown and charged in the currency of where the device is, not its language. */
    val currency: Currency get() = Currency.forCountry(regionCountryCode())

    init {
        // Refresh whenever the account changes (sign-in, sign-out, cold start with a session).
        scope.launch {
            authService?.currentUser?.map { it?.uid }?.distinctUntilChanged()?.collect { uid ->
                if (uid == null) preferences.setCachedEntitlement(Entitlement()) else refresh()
            }
        }
    }

    suspend fun refresh(): Entitlement {
        val svc = service ?: return entitlement.value
        val locale = Language.fromCode(preferences.languageCode.first()).code
        return when (val result = svc.fetchStatus(locale)) {
            is BillingResult.Success -> result.data.also { preferences.setCachedEntitlement(it) }
            else -> entitlement.value
        }
    }

    suspend fun startHostedDrill(): BillingResult<HostedDrill> {
        val svc = service ?: return BillingResult.Failure("Billing isn't available on this device.")
        val result = svc.startHostedDrill()
        when (result) {
            is BillingResult.Success -> preferences.setCachedEntitlement(result.data.entitlement)
            // Keep the cached view honest so Home stops offering a Start button that can't work.
            is BillingResult.OutOfDrills -> refresh()
            else -> Unit
        }
        return result
    }

    suspend fun subscribe(plan: PlanId, period: BillingPeriod, addOns: List<AddOn>): PurchaseResult {
        val svc = service ?: return PurchaseResult.Failed(UNAVAILABLE)
        val currency = currency
        val before = entitlement.value
        val request = when (val r = svc.createSubscriptionCheckout(plan, period, currency, addOns)) {
            is BillingResult.Success -> r.data
            is BillingResult.SignedOut -> return PurchaseResult.SignInRequired
            is BillingResult.Failure -> return PurchaseResult.Failed(r.message)
            is BillingResult.OutOfDrills -> return PurchaseResult.Failed(UNAVAILABLE)
        }
        return pay(request, currency) { it.effectivePlan == plan && it != before }
    }

    suspend fun buyAddOn(addOn: AddOn): PurchaseResult {
        val svc = service ?: return PurchaseResult.Failed(UNAVAILABLE)
        val currency = currency
        val before = entitlement.value
        val request = when (val r = svc.createAddOnPayment(addOn, currency)) {
            is BillingResult.Success -> r.data
            is BillingResult.SignedOut -> return PurchaseResult.SignInRequired
            is BillingResult.Failure -> return PurchaseResult.Failed(r.message)
            is BillingResult.OutOfDrills -> return PurchaseResult.Failed(UNAVAILABLE)
        }
        return pay(request, currency) {
            it.bonusDrills > before.bonusDrills || it.streakFreezesGranted > before.streakFreezesGranted
        }
    }

    /** Dunning, trainee side: pay the failed renewal now with a new card or Google Pay. */
    suspend fun fixFailedPayment(): PurchaseResult {
        val svc = service ?: return PurchaseResult.Failed(UNAVAILABLE)
        val statusBefore = entitlement.value.status
        val request = when (val r = svc.retryFailedPayment()) {
            is BillingResult.Success -> r.data
            is BillingResult.SignedOut -> return PurchaseResult.SignInRequired
            is BillingResult.Failure -> return PurchaseResult.Failed(r.message)
            is BillingResult.OutOfDrills -> return PurchaseResult.Failed(UNAVAILABLE)
        }
        // A subscription keeps its original currency; the sheet only uses this for Google Pay's label.
        return pay(request, currency) { it.status != statusBefore }
    }

    suspend fun cancel(acceptRetentionOffer: Boolean): BillingResult<Entitlement> {
        val svc = service ?: return BillingResult.Failure(UNAVAILABLE)
        return svc.cancelSubscription(acceptRetentionOffer).also {
            if (it is BillingResult.Success) preferences.setCachedEntitlement(it.data)
        }
    }

    suspend fun resume(): BillingResult<Entitlement> {
        val svc = service ?: return BillingResult.Failure(UNAVAILABLE)
        return svc.resumeSubscription().also {
            if (it is BillingResult.Success) preferences.setCachedEntitlement(it.data)
        }
    }

    /**
     * Presents the sheet, then waits for the webhook. Stripe confirms the payment to the app
     * before it tells the backend, so the plan usually lags by a second or two; polling briefly
     * means the paywall can close onto the new plan rather than onto a stale "Free".
     */
    private suspend fun pay(
        request: PaymentRequest,
        currency: Currency,
        isReflected: (Entitlement) -> Boolean
    ): PurchaseResult {
        if (request.type != IntentType.NONE) {
            val launcher = paymentLauncher ?: return PurchaseResult.Failed(UNAVAILABLE)
            when (val outcome = launcher.present(request, currency)) {
                PaymentOutcome.Canceled -> return PurchaseResult.Canceled
                is PaymentOutcome.Failed -> return PurchaseResult.Failed(outcome.message)
                PaymentOutcome.Completed -> Unit
            }
        }
        repeat(CONFIRM_POLL_ATTEMPTS) { attempt ->
            if (isReflected(refresh())) return PurchaseResult.Success
            delay(CONFIRM_POLL_BASE_MS * (attempt + 1))
        }
        return PurchaseResult.Pending
    }

    private companion object {
        const val UNAVAILABLE = "Purchases aren't available on this device yet."
        const val CONFIRM_POLL_ATTEMPTS = 6
        const val CONFIRM_POLL_BASE_MS = 700L
    }
}
