package com.bright.app.data.billing

import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.Currency
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.PlanId
import com.bright.app.domain.billing.SubscriptionStatus
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.tasks.await

/**
 * The billing endpoints as Firebase callables. Callables attach the signed-in user's ID token
 * automatically, which is how the backend knows whose plan it's looking at.
 *
 * Responses arrive as plain maps (the callable protocol's JSON); parsing is hand-written rather
 * than via kotlinx.serialization because the Firebase SDK has already decoded the JSON into
 * Java collections by the time it gets here.
 */
class FirebaseBillingService : BillingService {

    private val functions by lazy { FirebaseFunctions.getInstance("us-central1") }
    private val auth by lazy { FirebaseAuth.getInstance() }

    override suspend fun fetchStatus(locale: String): BillingResult<Entitlement> =
        call("getBillingStatus", mapOf("locale" to locale)) { parseEntitlement(it) }

    override suspend fun startHostedDrill(): BillingResult<HostedDrill> =
        call("startHostedDrill", emptyMap()) { data ->
            HostedDrill(
                drillId = data["drillId"] as String,
                entitlement = parseEntitlement(data["entitlement"].asMap())
            )
        }

    override suspend fun createSubscriptionCheckout(
        plan: PlanId,
        period: BillingPeriod,
        currency: Currency,
        addOns: List<AddOn>
    ): BillingResult<PaymentRequest> = call(
        "createSubscriptionCheckout",
        mapOf(
            "plan" to plan.name.lowercase(),
            "period" to period.name.lowercase(),
            "currency" to currency.code.lowercase(),
            "addOns" to addOns.map { it.lookupKey }
        )
    ) { parsePaymentRequest(it) }

    override suspend fun createAddOnPayment(addOn: AddOn, currency: Currency): BillingResult<PaymentRequest> =
        call(
            "createAddOnPayment",
            mapOf("addOn" to addOn.lookupKey, "currency" to currency.code.lowercase())
        ) { parsePaymentRequest(it) }

    override suspend fun cancelSubscription(acceptRetentionOffer: Boolean): BillingResult<Entitlement> =
        call("cancelSubscription", mapOf("acceptRetentionOffer" to acceptRetentionOffer)) { parseEntitlement(it) }

    override suspend fun resumeSubscription(): BillingResult<Entitlement> =
        call("resumeSubscription", emptyMap()) { parseEntitlement(it) }

    override suspend fun retryFailedPayment(): BillingResult<PaymentRequest> =
        call("retryFailedPayment", emptyMap()) { parsePaymentRequest(it) }

    private suspend fun <T> call(
        name: String,
        payload: Map<String, Any?>,
        parse: (Map<String, Any?>) -> T
    ): BillingResult<T> {
        if (auth.currentUser == null) return BillingResult.SignedOut
        return try {
            val result = functions.getHttpsCallable(name).call(payload).await()
            BillingResult.Success(parse(result.getData().asMap()))
        } catch (e: FirebaseFunctionsException) {
            when (e.code) {
                FirebaseFunctionsException.Code.RESOURCE_EXHAUSTED -> BillingResult.OutOfDrills
                FirebaseFunctionsException.Code.UNAUTHENTICATED -> BillingResult.SignedOut
                else -> BillingResult.Failure(e.message ?: "Billing request failed.")
            }
        } catch (e: Exception) {
            BillingResult.Failure(e.message ?: "Billing request failed.")
        }
    }

    private fun parsePaymentRequest(data: Map<String, Any?>) = PaymentRequest(
        clientSecret = data["clientSecret"] as String?,
        type = when (data["intentType"]) {
            "payment" -> IntentType.PAYMENT
            "setup" -> IntentType.SETUP
            else -> IntentType.NONE
        }
    )

    private fun parseEntitlement(data: Map<String, Any?>) = Entitlement(
        plan = enumOr(data["plan"], PlanId.FREE),
        period = (data["period"] as String?)?.let { p -> BillingPeriod.entries.firstOrNull { it.name == p } },
        status = enumOr(data["status"], SubscriptionStatus.NONE),
        trialEndsAtMillis = data["trialEndsAtMillis"].asLong(),
        currentPeriodEndMillis = data["currentPeriodEndMillis"].asLong(),
        cancelAtPeriodEnd = data["cancelAtPeriodEnd"] == true,
        drillsUsed = data["drillsUsed"].asLong().toInt(),
        drillsLimit = (data["drillsLimit"] as Number?)?.toInt(),
        bonusDrills = data["bonusDrills"].asLong().toInt(),
        streakFreezesGranted = data["streakFreezesGranted"].asLong().toInt(),
        trialEligible = data["trialEligible"] != false,
        retentionOfferEligible = data["retentionOfferEligible"] != false,
        discountActive = data["discountActive"] == true
    )

    private inline fun <reified E : Enum<E>> enumOr(value: Any?, fallback: E): E =
        enumValues<E>().firstOrNull { it.name == value } ?: fallback

    private fun Any?.asLong(): Long = (this as? Number)?.toLong() ?: 0L

    @Suppress("UNCHECKED_CAST")
    private fun Any?.asMap(): Map<String, Any?> = this as? Map<String, Any?> ?: emptyMap()
}
