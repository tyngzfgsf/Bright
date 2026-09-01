package com.bright.app.ui.notify

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionBadge
import platform.UserNotifications.UNAuthorizationOptionSound
import platform.UserNotifications.UNUserNotificationCenter
import kotlin.coroutines.resume

/** No Activity-style launcher needed on iOS — `UNUserNotificationCenter` is callable from anywhere. */
@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun RequestNotificationPermissionEffect(trigger: Boolean, onResult: (Boolean) -> Unit) {
    LaunchedEffect(trigger) {
        if (!trigger) return@LaunchedEffect
        val granted = suspendCancellableCoroutine<Boolean> { cont ->
            UNUserNotificationCenter.currentNotificationCenter().requestAuthorizationWithOptions(
                options = UNAuthorizationOptionAlert or UNAuthorizationOptionBadge or UNAuthorizationOptionSound
            ) { result, _ ->
                cont.resume(result)
            }
        }
        onResult(granted)
    }
}
