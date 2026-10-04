package com.bright.app.data.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

private const val CHANNEL_ID = "reminders"
private const val REQUEST_CODE_STREAK = 1001
private const val REQUEST_CODE_REVIEW = 1002

/**
 * `setAndAllowWhileIdle` rather than an exact alarm — neither reminder needs to the minute, and
 * this avoids needing the `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` permission for no real
 * benefit. Alarms don't survive a reboot on their own, and the trainee these reminders exist for
 * is exactly the one who *won't* open the app to reschedule them — so the app module's
 * `ReminderRescheduleReceiver` re-runs `syncLocalNotifications` on boot and on clock/timezone
 * changes (which shift what "8pm local" means).
 */
class AndroidNotifier(private val context: Context) : LocalNotifier {

    init {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            // Not localized: this only ever surfaces if a trainee drills into system
            // notification settings, unlike the notification content itself.
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Streak and review-due reminders"
                }
            )
        }
    }

    override suspend fun hasPermission(): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled()

    override suspend fun scheduleStreakReminder(atEpochMillis: Long) =
        schedule(REQUEST_CODE_STREAK, NotificationAlarmReceiver.TYPE_STREAK, atEpochMillis)

    override suspend fun cancelStreakReminder() =
        cancel(REQUEST_CODE_STREAK, NotificationAlarmReceiver.TYPE_STREAK)

    override suspend fun scheduleReviewReminder(atEpochMillis: Long) =
        schedule(REQUEST_CODE_REVIEW, NotificationAlarmReceiver.TYPE_REVIEW, atEpochMillis)

    override suspend fun cancelReviewReminder() =
        cancel(REQUEST_CODE_REVIEW, NotificationAlarmReceiver.TYPE_REVIEW)

    private fun schedule(requestCode: Int, type: String, atEpochMillis: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            atEpochMillis,
            pendingIntentFor(requestCode, type)
        )
    }

    private fun cancel(requestCode: Int, type: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntentFor(requestCode, type))
    }

    private fun pendingIntentFor(requestCode: Int, type: String): PendingIntent {
        val intent = Intent(context, NotificationAlarmReceiver::class.java).apply {
            putExtra(NotificationAlarmReceiver.EXTRA_TYPE, type)
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
