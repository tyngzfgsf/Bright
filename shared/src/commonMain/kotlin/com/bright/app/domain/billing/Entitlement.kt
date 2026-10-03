package com.bright.app.domain.billing

import kotlinx.serialization.Serializable

/**
 * Where the subscription stands, as Stripe reports it (mirrored into Firestore by the webhook).
 * [PAST_DUE] is the dunning window: a renewal failed, Stripe is retrying it automatically, and
 * the trainee keeps their plan in the meantime — see [Entitlement.hasPaidAccess].
 */
enum class SubscriptionStatus { NONE, TRIALING, ACTIVE, PAST_DUE, CANCELED }

/** Paid features, each gated on the lowest plan that includes it. */
enum class Feature(val minimumPlan: PlanId) {
    UNLIMITED_DRILLS(PlanId.PLUS),
    CUSTOM_SCENARIOS(PlanId.PLUS),
    EXPERT_DEBRIEF(PlanId.PRO)
}

/**
 * What the trainee is entitled to right now. Built from the backend's `getBillingStatus`
 * response and cached locally so the app knows the plan offline.
 *
 * Times are epoch millis; 0 means "not set".
 */
@Serializable
data class Entitlement(
    val plan: PlanId = PlanId.FREE,
    val period: BillingPeriod? = null,
    val status: SubscriptionStatus = SubscriptionStatus.NONE,
    val trialEndsAtMillis: Long = 0,
    val currentPeriodEndMillis: Long = 0,
    val cancelAtPeriodEnd: Boolean = false,
    /** Hosted drills used in the current monthly window. */
    val drillsUsed: Int = 0,
    /** Null = unlimited. */
    val drillsLimit: Int? = Pricing.FREE_DRILLS_PER_MONTH,
    /** Purchased drill-pack drills left. Spent only after the monthly allowance runs out. */
    val bonusDrills: Int = 0,
    /** Total streak freezes ever granted (bought, or Pro's monthly credit). Used count is local. */
    val streakFreezesGranted: Int = 0,
    val trialEligible: Boolean = true,
    val retentionOfferEligible: Boolean = true,
    /** True while a retention discount is applied to the subscription. */
    val discountActive: Boolean = false
) {
    /**
     * Past-due keeps access on purpose: cutting someone off the moment a card bounces punishes
     * the most common, most fixable failure (an expired card) and loses people Stripe's retries
     * would have recovered.
     */
    val hasPaidAccess: Boolean
        get() = plan != PlanId.FREE && status in setOf(
            SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE
        )

    val effectivePlan: PlanId get() = if (hasPaidAccess) plan else PlanId.FREE

    fun has(feature: Feature): Boolean = effectivePlan.ordinal >= feature.minimumPlan.ordinal

    /** Null when unlimited. */
    val drillsRemaining: Int?
        get() = drillsLimit?.let { (it - drillsUsed).coerceAtLeast(0) + bonusDrills }

    val isNearDrillLimit: Boolean get() = drillsRemaining?.let { it in 1..NEAR_LIMIT_THRESHOLD } ?: false
    val isOutOfDrills: Boolean get() = drillsRemaining == 0

    companion object {
        /** At or below this many drills left, the trainee gets a soft upgrade nudge. */
        const val NEAR_LIMIT_THRESHOLD = 2
    }
}
