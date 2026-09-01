package com.bright.app.ui.notify

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState

@Composable
actual fun RequestNotificationPermissionEffect(trigger: Boolean, onResult: (Boolean) -> Unit) {
    // No runtime permission exists before Android 13 (API 33) — notifications just work, so
    // there's nothing to launch a system prompt for.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        LaunchedEffect(trigger) {
            if (trigger) onResult(true)
        }
        return
    }

    val currentOnResult by rememberUpdatedState(onResult)
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> currentOnResult(granted) }

    LaunchedEffect(trigger) {
        if (trigger) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
