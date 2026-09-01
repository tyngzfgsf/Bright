package com.bright.app.ui.notify

import androidx.compose.runtime.Composable

/**
 * Fires the platform's real notification-permission prompt once, when [trigger] flips to true —
 * Android needs an Activity-bound launcher for this (`ActivityResultContracts`), iOS doesn't
 * (`UNUserNotificationCenter` is callable from anywhere), which is exactly the kind of
 * platform-shaped difference `expect`/`actual` exists for rather than routing through
 * `LocalNotifier` itself.
 */
@Composable
expect fun RequestNotificationPermissionEffect(trigger: Boolean, onResult: (Boolean) -> Unit)
