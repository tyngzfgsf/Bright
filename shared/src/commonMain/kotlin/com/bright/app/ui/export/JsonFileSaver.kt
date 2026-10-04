package com.bright.app.ui.export

import androidx.compose.runtime.Composable

enum class FileSaveResult { SAVED, CANCELLED, FAILED }

/**
 * Returns a `save(fileName, content)` function that hands a JSON file to the trainee to keep:
 * Android's system "save as" picker (the Storage Access Framework — no storage permission, and
 * the trainee chooses where it lands), iOS's share sheet (which offers "Save to Files").
 * `expect`/`actual` and Composable for the same reason as `RequestNotificationPermissionEffect`:
 * Android's picker needs an Activity-bound result launcher.
 */
@Composable
expect fun rememberJsonFileSaver(onResult: (FileSaveResult) -> Unit): (fileName: String, content: String) -> Unit
