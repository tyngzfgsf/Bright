package com.bright.app.domain

import kotlin.math.roundToInt

/**
 * SM-2-style scheduling (the same family of algorithm behind Anki) applied to individual
 * [com.bright.app.data.local.QuestionRecordEntity] rows: a missed question resurfaces the
 * next day; a well-answered one resurfaces further out each time, growing with its ease
 * factor. Pure functions over plain values — no I/O, no framework dependencies — same
 * shape as [SkillProfile].
 */
object SpacedRepetitionScheduler {

    /** The evolving scheduling state of one reviewable item. */
    data class Schedule(
        val repetitionCount: Int,
        val easeFactor: Double,
        val intervalDays: Int
    )

    val INITIAL_SCHEDULE = Schedule(repetitionCount = 0, easeFactor = 2.5, intervalDays = 0)

    private const val MIN_EASE = 1.3
    private const val DAY_MILLIS = 24L * 60 * 60 * 1000

    /** Score is 0-10; below this the item is treated as missed and resets to a 1-day interval. */
    const val PASSING_SCORE = 6

    /**
     * Computes the schedule that should apply *after* grading [score] against [previous]'s
     * state. A miss always resets the repetition streak and comes back tomorrow; a pass grows
     * the interval — 6 on the second pass, then previous interval times the (score-adjusted)
     * ease factor from the third pass on, exactly as classic SM-2 does.
     *
     * The one deliberate deviation from textbook SM-2 is the *first* pass: Anki gives every
     * first-time card a flat 1-day interval regardless of how well it was answered, because a
     * card there gets drilled multiple times in the same sitting before that matters. Here,
     * every graded answer is already a single real attempt (see `ChatViewModel.recordGradedQuestion`),
     * so a barely-passing 6/10 and a strong 9/10 need to separate immediately, not only after a
     * second review — otherwise both would tie for "due tomorrow" and the review queue couldn't
     * tell a near-miss from a strong answer on the very first day of data.
     */
    fun next(previous: Schedule, score: Int): Schedule {
        val quality = score.coerceIn(0, 10) * 5.0 / 10.0
        val newEase = (previous.easeFactor + (0.1 - (5.0 - quality) * (0.08 + (5.0 - quality) * 0.02)))
            .coerceAtLeast(MIN_EASE)

        if (score < PASSING_SCORE) {
            return Schedule(repetitionCount = 0, easeFactor = newEase, intervalDays = 1)
        }

        val repetition = previous.repetitionCount + 1
        val interval = when (repetition) {
            1 -> (1 + ((quality - 3.0) * 2).roundToInt()).coerceAtLeast(1)
            2 -> 6
            else -> (previous.intervalDays * newEase).roundToInt().coerceAtLeast(1)
        }
        return Schedule(repetitionCount = repetition, easeFactor = newEase, intervalDays = interval)
    }

    fun dueAtMillis(schedule: Schedule, nowMillis: Long): Long = nowMillis + schedule.intervalDays * DAY_MILLIS
}
