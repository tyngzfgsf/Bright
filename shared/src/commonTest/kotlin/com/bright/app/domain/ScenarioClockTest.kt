package com.bright.app.domain

import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.MessageRole
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScenarioClockTest {

    /** Builds a timeline from (role, seconds since start, score) triples. */
    private fun timeline(vararg items: Triple<MessageRole, Long, Int?>) =
        items.map { (role, seconds, score) -> TimelineEvent(role, seconds * 1000, score) }

    private fun q(at: Long) = Triple(MessageRole.AI_QUESTION, at, null)
    private fun a(at: Long) = Triple(MessageRole.USER, at, null)
    private fun f(at: Long, score: Int) = Triple(MessageRole.AI_FEEDBACK, at, score)
    private fun check(at: Long) = Triple(MessageRole.USER_VITALS_CHECK, at, null)
    private fun vitals(at: Long) = Triple(MessageRole.AI_VITALS, at, null)

    private val intermediate = Difficulty.INTERMEDIATE // late after 90 s

    @Test
    fun roundsPairAnswersWithQuestionsAcrossVitalsChecks() {
        val events = timeline(q(0), check(20), vitals(25), a(40), f(45, 8), q(45), a(200), f(205, 3))
        assertEquals(listOf(Round(40, 8), Round(155, 3)), ScenarioClock.rounds(events))
    }

    @Test
    fun decompensationOffNeverMovesTheStage() {
        val events = timeline(q(0), a(300), f(301, 0), q(301), a(600), f(601, 0))
        val state = ScenarioClock.stateAt(events, 601_000, intermediate, decompensationEnabled = false)
        assertEquals(PatientStage.STABLE, state.stage)
    }

    @Test
    fun lateOrMissedWorsensAndGoodOnTimeImproves() {
        val late = 1_000L
        assertEquals(PatientStage.WORSENING, ScenarioClock.nextStage(PatientStage.STABLE, Round(120, 10), 90))
        assertEquals(PatientStage.WORSENING, ScenarioClock.nextStage(PatientStage.STABLE, Round(10, 5), 90))
        assertEquals(PatientStage.STABLE, ScenarioClock.nextStage(PatientStage.WORSENING, Round(10, 7), 90))
        assertEquals(PatientStage.WORSENING, ScenarioClock.nextStage(PatientStage.WORSENING, Round(10, 6), 90))
        assertEquals(PatientStage.PERI_ARREST, ScenarioClock.nextStage(PatientStage.PERI_ARREST, Round(late, 0), 90))
        assertEquals(PatientStage.CRITICAL, ScenarioClock.nextStage(PatientStage.CRITICAL, Round(late, null), 90))
    }

    @Test
    fun stateReportsTheUngradedAnswerTimingAndCapsTheClock() {
        // Second answer is waiting to be graded and took 2 hours (app was closed).
        val events = timeline(q(0), a(30), f(31, 9), q(31), a(7231))
        val state = ScenarioClock.stateAt(events, 7231_000, intermediate, decompensationEnabled = true)
        assertEquals(7200L, state.answerSeconds)
        assertTrue(state.answerIsLate)
        assertNull(state.pendingSeconds)
        assertEquals((30 + ScenarioClock.MAX_ROUND_SECONDS).toInt() / 60, state.elapsedMinutes)
    }

    @Test
    fun vitalsTrendFollowsTheLatestGradedAnswer() {
        val open = timeline(q(0))
        assertEquals(VitalsTrend.BASELINE, ScenarioClock.vitalsTrend(open, 10_000, intermediate, false))

        val good = timeline(q(0), check(5), vitals(6), a(30), f(31, 9), q(31))
        assertEquals(VitalsTrend.IMPROVING, ScenarioClock.vitalsTrend(good, 40_000, intermediate, false))

        val wrong = timeline(q(0), check(5), vitals(6), a(30), f(31, 2), q(31))
        assertEquals(VitalsTrend.WORSENING, ScenarioClock.vitalsTrend(wrong, 40_000, intermediate, false))

        val nothingSince = timeline(q(0), a(30), f(31, 9), q(31), check(35), vitals(36))
        assertEquals(VitalsTrend.UNCHANGED, ScenarioClock.vitalsTrend(nothingSince, 40_000, intermediate, false))
    }

    @Test
    fun withDecompensationAWaitingLateQuestionWorsensVitals() {
        val events = timeline(q(0), check(5), vitals(6))
        assertEquals(VitalsTrend.UNCHANGED, ScenarioClock.vitalsTrend(events, 60_000, intermediate, true))
        assertEquals(VitalsTrend.WORSENING, ScenarioClock.vitalsTrend(events, 120_000, intermediate, true))
        // Same wait with decompensation off: nothing happened, so nothing changes.
        assertEquals(VitalsTrend.UNCHANGED, ScenarioClock.vitalsTrend(events, 120_000, intermediate, false))
    }

    @Test
    fun withDecompensationACorrectButLateAnswerStillWorsensVitals() {
        val events = timeline(q(0), check(5), vitals(6), a(200), f(201, 9), q(201))
        assertEquals(VitalsTrend.WORSENING, ScenarioClock.vitalsTrend(events, 210_000, intermediate, true))
        assertEquals(VitalsTrend.IMPROVING, ScenarioClock.vitalsTrend(events, 210_000, intermediate, false))
    }
}
