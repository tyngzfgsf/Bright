package com.bright.app.data.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

private const val CHANNEL_ID = "reminders"
private const val REQUEST_CODE_STREAK = 1001
private const val REQUEST_CODE_REVIEW = 1002

/**
 * `setAndAllowWhileIdle` rather than an exact alarm — neither reminder needs to the minute, and
 * this avoids needing the `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` permission for no real
 * benefit. Alarms don't survive a reboot (`RECEIVE_BOOT_COMPLETED` isn't requested); that's an
 * accepted trade-off — `syncLocalNotifications` reschedules from scratch on every app open, so
 * a reminder that got dropped by a reboot just comes back next time the trainee opens Bright,
 * same as it would if they'd never scheduled it in the first place.
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

    override suspend fun scheduleStreakReminder(hour: Int, minute: Int) =
        schedule(REQUEST_CODE_STREAK, NotificationAlarmReceiver.TYPE_STREAK, hour, minute)

    override suspend fun cancelStreakReminder() =
        cancel(REQUEST_CODE_STREAK, NotificationAlarmReceiver.TYPE_STREAK)

    override suspend fun scheduleReviewReminder(hour: Int, minute: Int) =
        schedule(REQUEST_CODE_REVIEW, NotificationAlarmReceiver.TYPE_REVIEW, hour, minute)

    override suspend fun cancelReviewReminder() =
        cancel(REQUEST_CODE_REVIEW, NotificationAlarmReceiver.TYPE_REVIEW)

    private fun schedule(requestCode: Int, type: String, hour: Int, minute: Int) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            nextOccurrenceMillis(hour, minute),
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

    private fun nextOccurrenceMillis(hour: Int, minute: Int): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (!target.after(now)) {
            target.add(Calendar.DAY_OF_YEAR, 1)
        }
        return target.timeInMillis
    }
}
