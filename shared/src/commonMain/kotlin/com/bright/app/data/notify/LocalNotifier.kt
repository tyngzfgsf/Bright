package com.bright.app.data.notify

/**
 * Schedules the two local (device-only, no push/backend) reminders Bright uses: a streak-at-risk
 * nudge and a reviews-due nudge. Each `scheduleX` call means "make sure a reminder is pending for
 * the next occurrence of this local wall-clock time" — implementations reschedule idempotently,
 * so callers don't need to track whether one is already pending.
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
    suspend fun scheduleStreakReminder(hour: Int, minute: Int)
    suspend fun cancelStreakReminder()

    suspend fun scheduleReviewReminder(hour: Int, minute: Int)
    suspend fun cancelReviewReminder()
}
