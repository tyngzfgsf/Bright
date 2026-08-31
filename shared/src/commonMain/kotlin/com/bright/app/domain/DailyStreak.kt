package com.bright.app.domain

/**
 * Consecutive-day streak tracking: "at least one completed session per day." Pure functions
 * over plain values — no I/O, no framework dependencies — same shape as [SkillProfile] and
 * [SpacedRepetitionScheduler]. Days are identified by a local calendar-day number (see
 * `currentLocalEpochDay()`), not raw epoch millis, so travel/timezone changes don't matter and
 * "today" always means the trainee's own local day.
 */
object DailyStreak {

    /** [lastActiveEpochDay] is 0 (never active) until the first completed session. */
    data class State(val count: Int, val lastActiveEpochDay: Long)

    val NONE = State(count = 0, lastActiveEpochDay = 0)

    /**
     * Called once per completed session. A second completion on the same day is a no-op — the
     * streak is "at least one session," not "every session." A gap of exactly one day continues
     * the streak; any bigger gap (or none yet) starts a fresh one at 1.
     */
    fun recordActiveDay(previous: State, todayEpochDay: Long): State =
        when (todayEpochDay - previous.lastActiveEpochDay) {
            0L -> previous
            1L -> State(count = previous.count + 1, lastActiveEpochDay = todayEpochDay)
            else -> State(count = 1, lastActiveEpochDay = todayEpochDay)
        }

    /**
     * What to show the trainee: the streak stays "alive" through the day after the last active
     * one (so it doesn't vanish before the trainee has even had a chance to act today) and only
     * reads as broken once a full day has passed with nothing logged.
     */
    fun displayedCount(state: State, todayEpochDay: Long): Int {
        val gap = todayEpochDay - state.lastActiveEpochDay
        return if (gap in 0L..1L) state.count else 0
    }
}
