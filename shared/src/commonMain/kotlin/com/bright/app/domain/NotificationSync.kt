package com.bright.app.domain

import com.bright.app.data.local.ChatDao
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.util.currentLocalEpochDay
import com.bright.app.util.currentTimeMillis
import com.bright.app.util.localDaysFromToday
import com.bright.app.util.localTimeMillis
import kotlinx.coroutines.flow.first

/** Streak reminder fires later than the review reminder, so a trainee who's already reviewed
 *  today's due questions still gets one last nudge if they haven't trained at all. */
private const val REVIEW_REMINDER_HOUR = 18
private const val STREAK_REMINDER_HOUR = 20

/** A review that only comes due after this hour waits for the next day's evening nudge rather
 *  than pinging the trainee late at night. */
private const val REVIEW_REMINDER_LATEST_HOUR = 21

/**
 * Re-evaluates both local reminders against current state and (re)schedules or cancels each —
 * idempotent, safe to call on every app open, after anything that could change either
 * condition (a session completing, a review being answered), and on reboot/clock changes.
 *
 * Both reminders are scheduled *ahead* for the moment they'll become true, not only when they
 * already are: the trainee who most needs a streak reminder is the one who won't open the app
 * on the day it's at risk, so waiting for an app open to notice the risk would never reach them.
 */
suspend fun syncLocalNotifications(dao: ChatDao, preferences: UserPreferences, notifier: LocalNotifier) {
    if (!notifier.hasPermission()) return
    val now = currentTimeMillis()

    val streakAt = streakReminderAt(preferences.streakState.first(), currentLocalEpochDay())
    if (streakAt != null && streakAt > now) {
        notifier.scheduleStreakReminder(streakAt)
    } else {
        notifier.cancelStreakReminder()
    }

    val reviewAt = dao.getEarliestDueAtMillis()?.let { reviewReminderAt(it, now) }
    if (reviewAt != null) {
        notifier.scheduleReviewReminder(reviewAt)
    } else {
        notifier.cancelReviewReminder()
    }
}

/**
 * The streak survives through the day after the last active one ([DailyStreak.displayedCount])
 * and breaks at that day's midnight — so the reminder belongs on that day's evening: tomorrow
 * right after a session, today if the trainee was last active yesterday. Null when there's no
 * streak to protect or it has already broken.
 */
private fun streakReminderAt(state: DailyStreak.State, today: Long): Long? {
    if (state.count <= 0) return null
    val daysUntilAtRisk = state.lastActiveEpochDay + 1 - today
    if (daysUntilAtRisk < 0) return null
    return localTimeMillis(daysUntilAtRisk, STREAK_REMINDER_HOUR, 0)
}

/**
 * The evening of the day the earliest review comes due (or today, if one's already overdue).
 * Never before the item is actually due — the queue only lists items with `dueAt <= now`, so a
 * nudge that fires early would open onto an empty queue. If that evening has passed, or the item
 * only comes due too late at night, the nudge moves to the next evening.
 */
private fun reviewReminderAt(earliestDueAtMillis: Long, now: Long): Long {
    val dueDay = maxOf(localDaysFromToday(earliestDueAtMillis), 0L)
    val eveningOfDueDay = localTimeMillis(dueDay, REVIEW_REMINDER_HOUR, 0)
    val candidate = maxOf(eveningOfDueDay, earliestDueAtMillis)
    return if (candidate <= now || candidate > localTimeMillis(dueDay, REVIEW_REMINDER_LATEST_HOUR, 0)) {
        localTimeMillis(dueDay + 1, REVIEW_REMINDER_HOUR, 0)
    } else {
        candidate
    }
}
