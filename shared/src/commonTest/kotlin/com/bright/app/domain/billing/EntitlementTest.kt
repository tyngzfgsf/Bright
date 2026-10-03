package com.bright.app.domain.billing

import com.bright.app.domain.DailyStreak
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EntitlementTest {

    @Test
    fun pastDueKeepsPaidAccessDuringRetries() {
        val e = Entitlement(plan = PlanId.PLUS, status = SubscriptionStatus.PAST_DUE, drillsLimit = null)
        assertTrue(e.hasPaidAccess)
        assertTrue(e.has(Feature.UNLIMITED_DRILLS))
    }

    @Test
    fun canceledFallsBackToFree() {
        val e = Entitlement(plan = PlanId.PRO, status = SubscriptionStatus.CANCELED)
        assertEquals(PlanId.FREE, e.effectivePlan)
        assertFalse(e.has(Feature.CUSTOM_SCENARIOS))
    }

    @Test
    fun proIncludesPlusFeatures() {
        val e = Entitlement(plan = PlanId.PRO, status = SubscriptionStatus.ACTIVE, drillsLimit = null)
        assertTrue(e.has(Feature.CUSTOM_SCENARIOS))
        assertTrue(e.has(Feature.EXPERT_DEBRIEF))
        val plus = e.copy(plan = PlanId.PLUS)
        assertFalse(plus.has(Feature.EXPERT_DEBRIEF))
    }

    @Test
    fun remainingDrillsCountsBonusAfterAllowance() {
        val e = Entitlement(drillsUsed = 10, drillsLimit = 10, bonusDrills = 20)
        assertEquals(20, e.drillsRemaining)
        assertFalse(e.isOutOfDrills)
        assertTrue(Entitlement(drillsUsed = 10, drillsLimit = 10).isOutOfDrills)
        assertTrue(Entitlement(drillsUsed = 8, drillsLimit = 10).isNearDrillLimit)
        assertNull(Entitlement(drillsLimit = null).drillsRemaining)
    }

    @Test
    fun freezesBridgeMissedDays() {
        val before = DailyStreak.State(count = 12, lastActiveEpochDay = 100)
        // Missed days 101 and 102, back on 103: needs two freezes.
        val bridged = DailyStreak.recordActiveDayWithFreezes(before, 103, freezesAvailable = 2)
        assertEquals(13, bridged.state.count)
        assertEquals(2, bridged.freezesConsumed)
    }

    @Test
    fun freezesAreNotSpentOnAStreakThatBreaksAnyway() {
        val before = DailyStreak.State(count = 12, lastActiveEpochDay = 100)
        val broken = DailyStreak.recordActiveDayWithFreezes(before, 105, freezesAvailable = 2)
        assertEquals(1, broken.state.count)
        assertEquals(0, broken.freezesConsumed)
    }

    @Test
    fun noFreezeNeededForConsecutiveDays() {
        val before = DailyStreak.State(count = 3, lastActiveEpochDay = 100)
        val next = DailyStreak.recordActiveDayWithFreezes(before, 101, freezesAvailable = 3)
        assertEquals(4, next.state.count)
        assertEquals(0, next.freezesConsumed)
    }

    @Test
    fun displayedStreakStaysAliveWhileFreezesCanCoverIt() {
        val state = DailyStreak.State(count = 5, lastActiveEpochDay = 100)
        assertEquals(5, DailyStreak.displayedCount(state, 103, freezesAvailable = 2))
        assertEquals(0, DailyStreak.displayedCount(state, 104, freezesAvailable = 2))
    }
}
