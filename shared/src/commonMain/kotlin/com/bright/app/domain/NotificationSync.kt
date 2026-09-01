package com.bright.app.domain

import com.bright.app.data.local.ChatDao
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.util.currentLocalEpochDay
import com.bright.app.util.currentTimeMillis
import kotlinx.coroutines.flow.first

/** Streak reminder fires later than the review reminder, so a trainee who's already reviewed
 *  today's due questions still gets one last nudge if they haven't trained at all. */
private const val REVIEW_REMINDER_HOUR = 18
private const val STREAK_REMINDER_HOUR = 20

/**
 * Re-evaluates both local reminders against current state and (re)schedules or cancels each —
 * idempotent, safe to call on every app open and after anything that could change either
 * condition (a session completing, a review being answered). There's no backend to push a
 * "your queue changed" event, so the app re-derives "should a reminder be pending" itself
 * every time it has a chance to run, same as the two-Composable notification-permission flow
 * this feeds into (see `RequestNotificationPermissionEffect`).
 */
suspend fun syncLocalNotifications(dao: ChatDao, preferences: UserPreferences, notifier: LocalNotifier) {
    if (!notifier.hasPermission()) return

    val streakState = preferences.streakState.first()
    val today = currentLocalEpochDay()
    val streakAtRisk = streakState.count > 0 && today - streakState.lastActiveEpochDay == 1L
    if (streakAtRisk) {
        notifier.scheduleStreakReminder(hour = STREAK_REMINDER_HOUR, minute = 0)
    } else {
        notifier.cancelStreakReminder()
    }

    val dueCount = dao.observeDueQuestionRecords(currentTimeMillis()).first().size
    if (dueCount > 0) {
        notifier.scheduleReviewReminder(hour = REVIEW_REMINDER_HOUR, minute = 0)
    } else {
        notifier.cancelReviewReminder()
    }
}
