package com.bright.app.data.billing

import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.PlanId

/** A price exactly as the store will charge it, already formatted for the trainee's storefront. */
data class StorePrice(
    /** "R49,99" / "₩3,500" / "$2.99" — whatever the store says, untouched. */
    val formatted: String,
    /** For annual products, the store's own per-month figure. */
    val perMonthFormatted: String?
)

sealed interface StoreOutcome {
    data object Completed : StoreOutcome
    data object Canceled : StoreOutcome
    /** The store isn't usable here (no SDK key, no store app, products not set up). */
    data object Unavailable : StoreOutcome
    data class Failed(val message: String) : StoreOutcome
}

/**
 * In-app purchases through the platform's app store. Android: Google Play Billing via
 * RevenueCat (`RevenueCatStoreBilling` in androidMain). iOS: not implemented yet — see
 * MONETIZATION.md "iOS" — so iOS gets [NoStoreBilling].
 *
 * Implementations never decide a plan themselves: after a purchase, [BillingRepository] waits
 * for the backend (fed by the store's webhook) to confirm it.
 */
interface StoreBilling {
    val isAvailable: Boolean

    /** Ties store purchases to the Firebase account, so the backend knows whose plan it is. */
    suspend fun logIn(uid: String)
    suspend fun logOut()

    /** Store prices for every plan and add-on, keyed like Pricing.lookupKey / AddOn.lookupKey. */
    suspend fun prices(): Map<String, StorePrice>

    suspend fun purchasePlan(plan: PlanId, period: BillingPeriod): StoreOutcome
    suspend fun purchaseAddOn(addOn: AddOn): StoreOutcome

    /** The exit offer through the store's own discount mechanism. */
    suspend fun purchaseRetentionOffer(plan: PlanId, period: BillingPeriod): StoreOutcome

    /** "Restore purchases". */
    suspend fun restore(): StoreOutcome
}

/** For platforms and builds without store billing. */
object NoStoreBilling : StoreBilling {
    override val isAvailable = false
    override suspend fun logIn(uid: String) = Unit
    override suspend fun logOut() = Unit
    override suspend fun prices(): Map<String, StorePrice> = emptyMap()
    override suspend fun purchasePlan(plan: PlanId, period: BillingPeriod) = StoreOutcome.Unavailable
    override suspend fun purchaseAddOn(addOn: AddOn) = StoreOutcome.Unavailable
    override suspend fun purchaseRetentionOffer(plan: PlanId, period: BillingPeriod) = StoreOutcome.Unavailable
    override suspend fun restore() = StoreOutcome.Unavailable
}
