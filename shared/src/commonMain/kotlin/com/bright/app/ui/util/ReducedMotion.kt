package com.bright.app.ui.util

import androidx.compose.runtime.Composable

/**
 * True when the user has asked the OS to minimise motion (Android: animations turned off / scale 0;
 * iOS: Reduce Motion). Animated UI that conveys information, like the vitals monitor, must snap
 * to its new value instead of easing when this is true.
 */
@Composable
expect fun rememberReducedMotion(): Boolean
