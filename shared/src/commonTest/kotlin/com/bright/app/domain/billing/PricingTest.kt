package com.bright.app.domain.billing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PricingTest {

    /**
     * Deliberately pessimistic local-currency-per-dollar rates (a *stronger* rand and won than
     * recent averages), so a currency move doesn't silently push the entry plan over US$3.
     * If a real rate moves past these, re-check the prices — don't just loosen the numbers.
     */
    private val unitsPerUsd = mapOf(
        Currency.ZAR to 17.0,
        Currency.KRW to 1_250.0,
        Currency.USD to 1.0
    )

    @Test
    fun entryPlanNeverCostsMoreThanThreeDollarsAMonth() {
        Currency.entries.forEach { currency ->
            val monthly = Pricing.price(PlanId.PLUS, BillingPeriod.MONTHLY, currency)
            val major = monthly.minorUnits.toDouble() / currency.minorUnitsPerMajor
            val usd = major / unitsPerUsd.getValue(currency)
            assertTrue(usd <= 3.0, "Plus monthly in ${currency.code} is US$$usd, over the US$3 cap")
        }
    }

    @Test
    fun neverMoreThanThreePlans() {
        assertTrue(Pricing.PLANS.size <= 3)
        assertEquals(Pricing.PLANS.size, Pricing.PLANS.toSet().size)
    }

    @Test
    fun exactlyOneRecommendedPlanAndItIsPaid() {
        assertTrue(Pricing.RECOMMENDED_PLAN in Pricing.PLANS)
        assertTrue(Pricing.RECOMMENDED_PLAN != PlanId.FREE)
    }

    @Test
    fun annualIsTwoMonthsFree() {
        assertEquals(2, Pricing.annualMonthsFree)
        assertEquals(
            Money(490_00, Currency.ZAR),
            Pricing.price(PlanId.PLUS, BillingPeriod.ANNUAL, Currency.ZAR)
        )
    }

    @Test
    fun monthlyEquivalentRoundsDown() {
        // R490 / 12 = R40.8333…
        assertEquals("R40.83", Pricing.monthlyEquivalent(PlanId.PLUS, BillingPeriod.ANNUAL, Currency.ZAR).format())
        // ₩35,000 / 12 = ₩2,916.67
        assertEquals("₩2,916", Pricing.monthlyEquivalent(PlanId.PLUS, BillingPeriod.ANNUAL, Currency.KRW).format())
        assertEquals("$2.49", Pricing.monthlyEquivalent(PlanId.PLUS, BillingPeriod.ANNUAL, Currency.USD).format())
    }

    @Test
    fun formatsEachCurrency() {
        assertEquals("R49", Money(49_00, Currency.ZAR).format())
        assertEquals("R0.79", Money(79, Currency.ZAR).format())
        assertEquals("₩3,500", Money(3_500, Currency.KRW).format())
        assertEquals("₩79,000", Money(79_000, Currency.KRW).format())
        assertEquals("$2.99", Money(2_99, Currency.USD).format())
        assertEquals("$1,000", Money(1_000_00, Currency.USD).format())
    }

    @Test
    fun currencyFollowsCountry() {
        assertEquals(Currency.ZAR, Currency.forCountry("za"))
        assertEquals(Currency.KRW, Currency.forCountry("KR"))
        assertEquals(Currency.USD, Currency.forCountry("DE"))
        assertEquals(Currency.USD, Currency.forCountry(null))
    }

    @Test
    fun drillPacksAreNotUpsoldOnUnlimitedPlans() {
        assertTrue(AddOn.DRILL_PACK !in Pricing.checkoutAddOnsFor(PlanId.PLUS))
        assertTrue(AddOn.DRILL_PACK !in Pricing.checkoutAddOnsFor(PlanId.PRO))
    }
}
