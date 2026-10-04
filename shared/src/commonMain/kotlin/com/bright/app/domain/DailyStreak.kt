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

    /** [state] after a completion, and how many streak freezes it took to keep the streak alive. */
    data class FreezeResult(val state: State, val freezesConsumed: Int)

    /**
     * [recordActiveDay], but missed days can be covered by streak freezes (a paid add-on, and a
     * monthly Pro perk). Each freeze covers exactly one missed day; if there aren't enough to
     * cover the whole gap, none are spent and the streak restarts — spending freezes on a streak
     * that breaks anyway would just burn something the trainee paid for.
     */
    fun recordActiveDayWithFreezes(previous: State, todayEpochDay: Long, freezesAvailable: Int): FreezeResult {
        val missedDays = todayEpochDay - previous.lastActiveEpochDay - 1
        val canBridge = previous.lastActiveEpochDay > 0 && missedDays in 1..freezesAvailable.toLong()
        return if (canBridge) {
            FreezeResult(State(count = previous.count + 1, lastActiveEpochDay = todayEpochDay), missedDays.toInt())
        } else {
            FreezeResult(recordActiveDay(previous, todayEpochDay), freezesConsumed = 0)
        }
    }

    /** [displayedCount], treating a gap that available freezes would bridge as still alive. */
    fun displayedCount(state: State, todayEpochDay: Long, freezesAvailable: Int): Int {
        val gap = todayEpochDay - state.lastActiveEpochDay
        return if (gap in 0L..(1L + freezesAvailable.coerceAtLeast(0))) state.count else 0
    }
}
