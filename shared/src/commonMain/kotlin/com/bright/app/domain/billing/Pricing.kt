package com.bright.app.domain.billing

/**
 * Bright's price book: plans, add-ons, and the currencies they're shown in. Pure values, no I/O
 * — same shape as [com.bright.app.domain.SkillProfile].
 *
 * **The backend has its own copy of these numbers** (`bright-site/functions/billing/catalog.js`)
 * and Stripe holds the authoritative charge amounts (Prices looked up by `lookup_key`, with one
 * `currency_options` entry per [Currency]). This copy exists so the paywall can render instantly
 * and offline; a mismatch shows a wrong number on screen, never a wrong charge. Change all three
 * together. See MONETIZATION.md.
 *
 * Two rules are enforced by tests (`PricingTest`), not convention:
 * - The entry paid plan ([PlanId.PLUS], monthly) never costs more than US$3 in any currency.
 * - No more than three plans are ever offered.
 */
enum class PlanId { FREE, PLUS, PRO }

enum class BillingPeriod { MONTHLY, ANNUAL }

/**
 * [minorUnitsPerMajor] is 100 for cents, 1 for currencies without a minor unit (KRW) — the same
 * convention Stripe uses for amounts, so these numbers can be compared with Stripe's directly.
 */
enum class Currency(val code: String, val symbol: String, val minorUnitsPerMajor: Int) {
    ZAR("ZAR", "R", 100),
    KRW("KRW", "₩", 1),
    USD("USD", "$", 100);

    companion object {
        /**
         * Picks the display/charge currency from an ISO 3166 country code (the device's network or
         * SIM country, falling back to its locale region — see each platform's `regionCountryCode`).
         * Anywhere without a local price gets USD.
         */
        fun forCountry(countryCode: String?): Currency = when (countryCode?.uppercase()) {
            "ZA" -> ZAR
            "KR" -> KRW
            else -> USD
        }

        fun fromCode(code: String?): Currency? = entries.firstOrNull { it.code.equals(code, ignoreCase = true) }
    }
}

/** An amount in a currency's minor units (cents, or whole won). */
data class Money(val minorUnits: Long, val currency: Currency) {
    /** "R49", "R40.83", "₩3,500", "$2.99" — whole amounts drop the decimals. */
    fun format(): String {
        val perMajor = currency.minorUnitsPerMajor
        val major = minorUnits / perMajor
        val minor = minorUnits % perMajor
        val majorText = groupThousands(major)
        return if (perMajor == 1 || minor == 0L) {
            "${currency.symbol}$majorText"
        } else {
            "${currency.symbol}$majorText.${minor.toString().padStart(2, '0')}"
        }
    }

    operator fun plus(other: Money): Money {
        require(other.currency == currency) { "Can't add ${other.currency} to $currency" }
        return Money(minorUnits + other.minorUnits, currency)
    }

    private fun groupThousands(value: Long): String =
        value.toString().reversed().chunked(3).joinToString(",").reversed()
}

/** One-time purchases offered alongside a plan — at checkout, and when a free trainee hits the cap. */
enum class AddOn(
    /** Matches the Stripe Price `lookup_key` and the backend catalog key. */
    val lookupKey: String
) {
    /** +[Pricing.DRILL_PACK_SIZE] hosted drills that never expire. Only useful on the capped Free plan. */
    DRILL_PACK("addon_drill_pack"),

    /** [Pricing.STREAK_FREEZE_PACK_SIZE] streak freezes, each covering one missed day. */
    STREAK_FREEZES("addon_streak_freezes")
}

object Pricing {

    /** Hosted (no own Groq key) drills per calendar month on Free. The backend enforces this. */
    const val FREE_DRILLS_PER_MONTH = 10

    /** Free-trial length for [PlanId.PLUS], once per account. */
    const val PLUS_TRIAL_DAYS = 7

    const val DRILL_PACK_SIZE = 20
    const val STREAK_FREEZE_PACK_SIZE = 3

    /** Pro gets this many streak freezes credited every paid month. */
    const val PRO_MONTHLY_STREAK_FREEZES = 3

    /** Exit offer: this percent off for this many months, once per account. */
    const val RETENTION_DISCOUNT_PERCENT = 50
    const val RETENTION_DISCOUNT_MONTHS = 3

    /** Annual = this many months' price, i.e. "2 months free". */
    const val ANNUAL_MONTHS_CHARGED = 10

    /** The plan the paywall highlights. Exactly one. */
    val RECOMMENDED_PLAN = PlanId.PLUS

    /** In display order. */
    val PLANS: List<PlanId> = listOf(PlanId.FREE, PlanId.PLUS, PlanId.PRO)

    private val MONTHLY: Map<PlanId, Map<Currency, Long>> = mapOf(
        PlanId.FREE to mapOf(Currency.ZAR to 0L, Currency.KRW to 0L, Currency.USD to 0L),
        PlanId.PLUS to mapOf(Currency.ZAR to 49_00L, Currency.KRW to 3_500L, Currency.USD to 2_99L),
        PlanId.PRO to mapOf(Currency.ZAR to 99_00L, Currency.KRW to 7_900L, Currency.USD to 5_99L)
    )

    private val ADD_ONS: Map<AddOn, Map<Currency, Long>> = mapOf(
        AddOn.DRILL_PACK to mapOf(Currency.ZAR to 25_00L, Currency.KRW to 2_000L, Currency.USD to 1_29L),
        AddOn.STREAK_FREEZES to mapOf(Currency.ZAR to 15_00L, Currency.KRW to 1_000L, Currency.USD to 79L)
    )

    /** What one billing period costs: a month's price, or a year's ([ANNUAL_MONTHS_CHARGED] months). */
    fun price(plan: PlanId, period: BillingPeriod, currency: Currency): Money {
        val monthly = MONTHLY.getValue(plan).getValue(currency)
        val amount = when (period) {
            BillingPeriod.MONTHLY -> monthly
            BillingPeriod.ANNUAL -> monthly * ANNUAL_MONTHS_CHARGED
        }
        return Money(amount, currency)
    }

    /**
     * The "R40.83/month billed annually" figure. Rounded down, so the per-month number shown
     * never overstates the saving.
     */
    fun monthlyEquivalent(plan: PlanId, period: BillingPeriod, currency: Currency): Money {
        val total = price(plan, period, currency).minorUnits
        return when (period) {
            BillingPeriod.MONTHLY -> Money(total, currency)
            BillingPeriod.ANNUAL -> Money(total / 12, currency)
        }
    }

    /** Months free when paying annually, for the "Get 2 months free" label. */
    val annualMonthsFree: Int get() = 12 - ANNUAL_MONTHS_CHARGED

    fun addOnPrice(addOn: AddOn, currency: Currency): Money =
        Money(ADD_ONS.getValue(addOn).getValue(currency), currency)

    /** Stripe Price `lookup_key` for a plan, matching the backend catalog. Null for Free. */
    fun lookupKey(plan: PlanId, period: BillingPeriod): String? = when (plan) {
        PlanId.FREE -> null
        else -> "${plan.name.lowercase()}_${period.name.lowercase()}"
    }

    /** Add-ons worth offering as a checkout upsell for this plan. Drill packs are pointless on an unlimited plan. */
    fun checkoutAddOnsFor(plan: PlanId): List<AddOn> = when (plan) {
        PlanId.FREE -> listOf(AddOn.DRILL_PACK, AddOn.STREAK_FREEZES)
        PlanId.PLUS -> listOf(AddOn.STREAK_FREEZES)
        // Pro already gets monthly freezes; a one-off pack on top still makes sense for a long trip.
        PlanId.PRO -> listOf(AddOn.STREAK_FREEZES)
    }
}
