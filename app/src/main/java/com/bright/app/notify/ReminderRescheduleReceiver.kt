package com.bright.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bright.app.BrightApplication
import com.bright.app.domain.syncLocalNotifications
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Re-runs [syncLocalNotifications] when pending alarms stop meaning what they did: a reboot
 * clears them outright, and a clock or timezone change shifts which instant is "8pm local".
 * Lives in the app module rather than next to `NotificationAlarmReceiver` because it needs
 * [BrightApplication]'s database and preferences, which the shared module can't see.
 */
class ReminderRescheduleReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED -> Unit
            else -> return
        }
        val app = context.applicationContext as BrightApplication
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                syncLocalNotifications(app.database.chatDao(), app.userPreferences, app.notifier)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
