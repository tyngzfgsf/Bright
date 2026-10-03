package com.bright.app.data.billing

import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.Currency
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.PlanId

sealed interface BillingResult<out T> {
    data class Success<T>(val data: T) : BillingResult<T>

    /** The free (or fair-use) drill allowance is spent. The app answers this with the paywall. */
    data object OutOfDrills : BillingResult<Nothing>

    /** Not signed in — billing calls need an account. */
    data object SignedOut : BillingResult<Nothing>

    data class Failure(val message: String) : BillingResult<Nothing>
}

/** What PaymentSheet should confirm. */
enum class IntentType {
    PAYMENT,

    /** Nothing due today (trial, no add-ons): just save a payment method for later. */
    SETUP,

    /** Settled server-side; nothing for the trainee to do. */
    NONE
}

data class PaymentRequest(val clientSecret: String?, val type: IntentType)

data class HostedDrill(val drillId: String, val entitlement: Entitlement)

/**
 * The backend's billing endpoints (bright-site/functions/billing/stripe.js), behind a
 * platform-neutral interface like [com.bright.app.data.auth.AuthService]. Android calls them as
 * Firebase callables; iOS has no implementation yet and gets null.
 */
interface BillingService {
    /** [locale] ("en"/"ko") is recorded server-side so billing emails arrive in the app's language. */
    suspend fun fetchStatus(locale: String): BillingResult<Entitlement>

    /** Spends one hosted drill. [BillingResult.OutOfDrills] when none are left. */
    suspend fun startHostedDrill(): BillingResult<HostedDrill>

    suspend fun createSubscriptionCheckout(
        plan: PlanId,
        period: BillingPeriod,
        currency: Currency,
        addOns: List<AddOn>
    ): BillingResult<PaymentRequest>

    suspend fun createAddOnPayment(addOn: AddOn, currency: Currency): BillingResult<PaymentRequest>

    /** [acceptRetentionOffer] true takes the exit offer instead of cancelling. */
    suspend fun cancelSubscription(acceptRetentionOffer: Boolean): BillingResult<Entitlement>

    suspend fun resumeSubscription(): BillingResult<Entitlement>

    /** Dunning: the open renewal invoice, to pay now instead of waiting for Stripe's next retry. */
    suspend fun retryFailedPayment(): BillingResult<PaymentRequest>
}

sealed interface PaymentOutcome {
    data object Completed : PaymentOutcome
    data object Canceled : PaymentOutcome
    data class Failed(val message: String) : PaymentOutcome
}

/**
 * Presents the platform payment sheet (Stripe PaymentSheet with Google Pay on Android) for a
 * client secret from [BillingService]. Payment UI stays inside the app.
 */
interface PaymentLauncher {
    /** False when this build has no payment configuration (e.g. no Stripe publishable key). */
    val isAvailable: Boolean

    suspend fun present(request: PaymentRequest, currency: Currency): PaymentOutcome
}
