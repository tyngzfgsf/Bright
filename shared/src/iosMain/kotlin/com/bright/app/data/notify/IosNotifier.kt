package com.bright.app.data.notify

import com.bright.app.resources.Res
import com.bright.app.resources.notif_review_body
import com.bright.app.resources.notif_review_title
import com.bright.app.resources.notif_streak_body
import com.bright.app.resources.notif_streak_title
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.suspendCancellableCoroutine
import org.jetbrains.compose.resources.getString
import platform.Foundation.NSCalendar
import platform.Foundation.NSCalendarUnitDay
import platform.Foundation.NSCalendarUnitHour
import platform.Foundation.NSCalendarUnitMinute
import platform.Foundation.NSCalendarUnitMonth
import platform.Foundation.NSCalendarUnitYear
import platform.Foundation.NSDate
import platform.Foundation.dateWithTimeIntervalSince1970
import platform.UserNotifications.UNAuthorizationStatusAuthorized
import platform.UserNotifications.UNCalendarNotificationTrigger
import platform.UserNotifications.UNMutableNotificationContent
import platform.UserNotifications.UNNotificationRequest
import platform.UserNotifications.UNUserNotificationCenter
import kotlin.coroutines.resume

private const val ID_STREAK = "streak-reminder"
private const val ID_REVIEW = "review-reminder"

/**
 * Unlike Android's alarm-then-receiver indirection, a `UNNotificationRequest` carries its
 * content up front — there's no hook to decide title/body only once it's about to fire — so
 * [schedule] resolves the localized strings right when scheduling happens (already a suspend
 * context, see [LocalNotifier.scheduleStreakReminder]'s doc).
 */
@OptIn(ExperimentalForeignApi::class)
class IosNotifier : LocalNotifier {

    private val center get() = UNUserNotificationCenter.currentNotificationCenter()

    override suspend fun hasPermission(): Boolean = suspendCancellableCoroutine { cont ->
        center.getNotificationSettingsWithCompletionHandler { settings ->
            cont.resume(settings?.authorizationStatus == UNAuthorizationStatusAuthorized)
        }
    }

    override suspend fun scheduleStreakReminder(atEpochMillis: Long) {
        schedule(ID_STREAK, atEpochMillis, getString(Res.string.notif_streak_title), getString(Res.string.notif_streak_body))
    }

    override suspend fun cancelStreakReminder() {
        center.removePendingNotificationRequestsWithIdentifiers(listOf(ID_STREAK))
    }

    override suspend fun scheduleReviewReminder(atEpochMillis: Long) {
        schedule(ID_REVIEW, atEpochMillis, getString(Res.string.notif_review_title), getString(Res.string.notif_review_body))
    }

    override suspend fun cancelReviewReminder() {
        center.removePendingNotificationRequestsWithIdentifiers(listOf(ID_REVIEW))
    }

    private suspend fun schedule(id: String, atEpochMillis: Long, title: String, body: String) {
        val content = UNMutableNotificationContent().apply {
            setTitle(title)
            setBody(body)
        }
        // Full date components (not just hour/minute) pin the exact day the caller chose, and a
        // calendar trigger — unlike a time-interval one — still fires at that local wall-clock
        // time if the device's clock or timezone changes in between.
        val calendar = NSCalendar.currentCalendar
        val dateComponents = calendar.components(
            NSCalendarUnitYear or NSCalendarUnitMonth or NSCalendarUnitDay or NSCalendarUnitHour or NSCalendarUnitMinute,
            fromDate = NSDate.dateWithTimeIntervalSince1970(atEpochMillis / 1000.0)
        )
        val trigger = UNCalendarNotificationTrigger.triggerWithDateMatchingComponents(
            dateComponents = dateComponents,
            repeats = false
        )
        val request = UNNotificationRequest.requestWithIdentifier(id, content, trigger)
        suspendCancellableCoroutine { cont ->
            center.addNotificationRequest(request) { cont.resume(Unit) }
        }
    }
}
