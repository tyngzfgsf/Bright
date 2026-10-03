package com.bright.app.domain

import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.MessageRole

/**
 * How sick the patient is right now, when time-based decompensation is on. Ordered: each step
 * is one deterioration. [promptLabel] is what the model is told; the UI never shows it directly.
 *
 * Labels describe severity, never direction. A "deteriorating" label once sat next to an
 * IMPROVING vitals request (a correct but late answer) and the model followed the label, writing
 * worse numbers under an "Improving" chip. Which way things are moving is the trend's job alone.
 */
enum class PatientStage(val promptLabel: String) {
    STABLE("at the scenario's opening severity"),
    WORSENING("moderately compromised: vitals clearly further from normal than at presentation"),
    CRITICAL("critically compromised: marked hemodynamic or respiratory compromise, altered mental status"),
    PERI_ARREST("peri-arrest: about to arrest or already arrested; the case now centers on resuscitation");

    fun worse(): PatientStage = entries[(ordinal + 1).coerceAtMost(entries.lastIndex)]
    fun better(): PatientStage = entries[(ordinal - 1).coerceAtLeast(0)]
}

/** How a vitals reading compares with the one before it (or with the presentation, if none). */
enum class VitalsTrend { BASELINE, IMPROVING, UNCHANGED, WORSENING }

/** Only what [ScenarioClock] needs from a stored message — keeps it free of Room and UI types. */
data class TimelineEvent(val role: MessageRole, val timestampMillis: Long, val score: Int? = null)

/** One answered question: how long the trainee took, and what that answer scored (null if ungraded). */
data class Round(val responseSeconds: Long, val score: Int?)

/** Everything the prompt needs to know about scenario time and patient state for one AI call. */
data class ScenarioState(
    /** Simulated time since the scenario opened, in whole minutes. */
    val elapsedMinutes: Int,
    val decompensationEnabled: Boolean,
    /** Where the patient is before this call's answer is graded. Always STABLE when decompensation is off. */
    val stage: PatientStage,
    /** Seconds the open question has been waiting (at the moment of this call), or null if none is open. */
    val pendingSeconds: Long?,
    val lateAfterSeconds: Long,
    /** How long the answer about to be graded took, or null when there's no ungraded answer. */
    val answerSeconds: Long? = null
) {
    val pendingIsLate: Boolean get() = pendingSeconds != null && pendingSeconds > lateAfterSeconds
    val answerIsLate: Boolean get() = answerSeconds != null && answerSeconds > lateAfterSeconds

    companion object {
        val OPENING = ScenarioState(0, decompensationEnabled = false, PatientStage.STABLE, null, 90)
    }
}

/**
 * Scenario time and patient state, derived entirely on-device from the session's own messages —
 * nothing here is the model's opinion. The model is told the result and only narrates it, so the
 * same trainee behavior always produces the same deterioration, whatever model is selected.
 *
 * Time is real time: a round costs however long the trainee actually took to answer. Each round
 * is capped at [MAX_ROUND_SECONDS], so walking away mid-session and resuming from History a day
 * later reads as a slow answer rather than a patient who's been untreated for 24 hours.
 */
object ScenarioClock {

    const val MAX_ROUND_SECONDS = 5 * 60L
    /** A vitals check takes a little scenario time, but never counts as a delay by itself. */
    const val VITALS_CHECK_SECONDS = 30L

    /** An answer scoring this or lower is treated as a missed intervention. */
    const val MISSED_MAX_SCORE = 5
    /** An on-time answer scoring this or higher stabilizes the patient one step. */
    const val GOOD_MIN_SCORE = 7

    fun lateAfterSeconds(difficulty: Difficulty): Long = when (difficulty) {
        Difficulty.BEGINNER -> 150
        Difficulty.INTERMEDIATE -> 90
        Difficulty.ADVANCED -> 60
    }

    /**
     * Pairs each trainee answer with the question it answered and the score it then received.
     * Vitals checks and side questions in between don't break the pairing — time spent on them
     * is time the intervention was still pending.
     */
    fun rounds(events: List<TimelineEvent>): List<Round> {
        val result = mutableListOf<Round>()
        var questionAt: Long? = null
        var pendingAnswerSeconds: Long? = null
        for (event in events) {
            when (event.role) {
                MessageRole.AI_QUESTION -> {
                    pendingAnswerSeconds?.let { result += Round(it, null) }
                    pendingAnswerSeconds = null
                    questionAt = event.timestampMillis
                }
                MessageRole.USER -> {
                    val asked = questionAt ?: continue
                    pendingAnswerSeconds?.let { result += Round(it, null) }
                    pendingAnswerSeconds = ((event.timestampMillis - asked) / 1000).coerceAtLeast(0)
                    questionAt = null
                }
                MessageRole.AI_FEEDBACK -> {
                    pendingAnswerSeconds?.let { result += Round(it, event.score) }
                    pendingAnswerSeconds = null
                }
                else -> Unit
            }
        }
        pendingAnswerSeconds?.let { result += Round(it, null) }
        return result
    }

    /** The stage after one graded round. Ungraded rounds (score null) leave it unchanged. */
    fun nextStage(stage: PatientStage, round: Round, lateAfterSeconds: Long): PatientStage {
        val score = round.score ?: return stage
        val late = round.responseSeconds > lateAfterSeconds
        return when {
            late || score <= MISSED_MAX_SCORE -> stage.worse()
            score >= GOOD_MIN_SCORE -> stage.better()
            else -> stage
        }
    }

    fun stageAfter(rounds: List<Round>, lateAfterSeconds: Long): PatientStage =
        rounds.fold(PatientStage.STABLE) { stage, round -> nextStage(stage, round, lateAfterSeconds) }

    /** The state to hand the model for a call made at [nowMillis]. */
    fun stateAt(
        events: List<TimelineEvent>,
        nowMillis: Long,
        difficulty: Difficulty,
        decompensationEnabled: Boolean
    ): ScenarioState {
        val lateAfter = lateAfterSeconds(difficulty)
        val rounds = rounds(events)
        val openQuestionAt = openQuestionAt(events)
        val pendingSeconds = openQuestionAt?.let { ((nowMillis - it) / 1000).coerceAtLeast(0) }

        val roundSeconds = rounds.sumOf { it.responseSeconds.coerceAtMost(MAX_ROUND_SECONDS) }
        val vitalsSeconds = events.count { it.role == MessageRole.AI_VITALS } * VITALS_CHECK_SECONDS
        val pending = pendingSeconds?.coerceAtMost(MAX_ROUND_SECONDS) ?: 0
        return ScenarioState(
            elapsedMinutes = ((roundSeconds + vitalsSeconds + pending) / 60).toInt(),
            decompensationEnabled = decompensationEnabled,
            stage = if (decompensationEnabled) stageAfter(rounds, lateAfter) else PatientStage.STABLE,
            pendingSeconds = pendingSeconds,
            lateAfterSeconds = lateAfter,
            answerSeconds = rounds.lastOrNull()?.takeIf { it.score == null && openQuestionAt == null }?.responseSeconds
        )
    }

    /** When the question still waiting for an answer was asked, or null if the last one was answered. */
    fun openQuestionAt(events: List<TimelineEvent>): Long? {
        val last = events.lastOrNull { it.role == MessageRole.AI_QUESTION || it.role == MessageRole.USER }
        return last?.takeIf { it.role == MessageRole.AI_QUESTION }?.timestampMillis
    }

    /**
     * The trend a vitals check at [nowMillis] must show. Compared with the previous reading, or
     * with the presentation when there hasn't been one:
     * - no answer graded since then → BASELINE for a first reading, otherwise UNCHANGED;
     * - otherwise the latest graded answer decides: [GOOD_MIN_SCORE]+ improves, [MISSED_MAX_SCORE]
     *   or lower worsens (a wrong intervention never looks like it helped), in between holds.
     * With decompensation on, the patient's stage wins whenever it has moved since the last
     * reading — including a provisional step for an open question that's already late, which is
     * how a patient visibly worsens while the trainee sits on a decision.
     */
    fun vitalsTrend(
        events: List<TimelineEvent>,
        nowMillis: Long,
        difficulty: Difficulty,
        decompensationEnabled: Boolean
    ): VitalsTrend {
        val lastReadingIndex = events.indexOfLast { it.role == MessageRole.AI_VITALS }
        val sinceReading = if (lastReadingIndex >= 0) events.drop(lastReadingIndex + 1) else events
        val latestScore = sinceReading.lastOrNull { it.role == MessageRole.AI_FEEDBACK && it.score != null }?.score

        if (decompensationEnabled) {
            val state = stateAt(events, nowMillis, difficulty, decompensationEnabled = true)
            val stageNow = if (state.pendingIsLate) state.stage.worse() else state.stage
            val stageAtReading = if (lastReadingIndex >= 0) {
                val before = events.take(lastReadingIndex + 1)
                val atReading = stateAt(before, events[lastReadingIndex].timestampMillis, difficulty, true)
                if (atReading.pendingIsLate) atReading.stage.worse() else atReading.stage
            } else {
                PatientStage.STABLE
            }
            when {
                stageNow > stageAtReading -> return VitalsTrend.WORSENING
                stageNow < stageAtReading -> return VitalsTrend.IMPROVING
                // Already as bad as it gets and still missing: holding at peri-arrest isn't "unchanged".
                stageNow == PatientStage.PERI_ARREST && latestScore != null && latestScore <= MISSED_MAX_SCORE ->
                    return VitalsTrend.WORSENING
            }
        }

        return when {
            latestScore == null -> if (lastReadingIndex >= 0) VitalsTrend.UNCHANGED else VitalsTrend.BASELINE
            latestScore >= GOOD_MIN_SCORE -> VitalsTrend.IMPROVING
            latestScore <= MISSED_MAX_SCORE -> VitalsTrend.WORSENING
            else -> VitalsTrend.UNCHANGED
        }
    }
}
