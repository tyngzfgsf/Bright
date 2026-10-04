package com.bright.app.data.notify

/**
 * Schedules the two local (device-only, no push/backend) reminders Bright uses: a streak-at-risk
 * nudge and a reviews-due nudge. Each `scheduleX` call means "make sure this reminder is pending
 * for exactly [atEpochMillis], replacing any earlier one" — implementations reschedule
 * idempotently, so callers don't need to track whether one is already pending. Callers pick the
 * instant themselves (see `syncLocalNotifications`): the right day depends on app state, e.g.
 * "8pm tomorrow" right after a session, not the next 8pm that happens to come around.
 *
 * Deliberately inexact ("sometime this evening", not "at exactly 20:00:00") on both platforms —
 * neither reminder is time-critical, and exact scheduling on Android would need the
 * `SCHEDULE_EXACT_ALARM` permission for no real benefit here.
 */
interface LocalNotifier {
    suspend fun hasPermission(): Boolean

    /**
     * `suspend` because iOS has to resolve the localized title/body *now* — a plain local
     * notification request carries its content at schedule time, there's no equivalent of
     * Android's alarm-fires-then-a-receiver-decides-the-content indirection. Android's own
     * implementation doesn't need the suspend context, but honors it as any suspend fun does.
     */
    suspend fun scheduleStreakReminder(atEpochMillis: Long)
    suspend fun cancelStreakReminder()

    suspend fun scheduleReviewReminder(atEpochMillis: Long)
    suspend fun cancelReviewReminder()
}
