package com.bright.app.data.notify

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bright.app.resources.Res
import com.bright.app.resources.notif_review_body
import com.bright.app.resources.notif_review_title
import com.bright.app.resources.notif_streak_body
import com.bright.app.resources.notif_streak_title
import com.bright.shared.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.getString

private const val CHANNEL_ID = "reminders"

/**
 * Fired by the `AlarmManager` alarm `AndroidNotifier` schedules. Notification content is
 * localized (`getString`, Compose Resources' non-Composable accessor — this runs with no
 * Composition around it), which is why this needs its own coroutine rather than building the
 * notification synchronously in [onReceive]: `goAsync()` keeps the receiver alive long enough
 * for that suspend call to finish before the process is free to die.
 */
class NotificationAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val EXTRA_TYPE = "type"
        const val TYPE_STREAK = "streak"
        const val TYPE_REVIEW = "review"
        private const val NOTIFICATION_ID_STREAK = 1
        private const val NOTIFICATION_ID_REVIEW = 2
    }

    override fun onReceive(context: Context, intent: Intent) {
        val type = intent.getStringExtra(EXTRA_TYPE) ?: return
        val appContext = context.applicationContext
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val (id, title, body) = when (type) {
                    TYPE_STREAK -> Triple(
                        NOTIFICATION_ID_STREAK,
                        getString(Res.string.notif_streak_title),
                        getString(Res.string.notif_streak_body)
                    )
                    TYPE_REVIEW -> Triple(
                        NOTIFICATION_ID_REVIEW,
                        getString(Res.string.notif_review_title),
                        getString(Res.string.notif_review_body)
                    )
                    else -> return@launch
                }
                postNotification(appContext, id, title, body)
            } finally {
                pendingResult.finish()
            }
        }
    }

    // hasPermission() already gates every schedule() call in AndroidNotifier — the only way this
    // fires without permission is the trainee revoking it between scheduling and the alarm going
    // off, in which case NotificationManagerCompat.notify() is documented to silently no-op.
    @SuppressLint("MissingPermission")
    private fun postNotification(context: Context, id: Int, title: String, body: String) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(context, id, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        NotificationManagerCompat.from(context).notify(id, notification)
    }
}
