package com.bright.app.ui.export

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
actual fun rememberJsonFileSaver(onResult: (FileSaveResult) -> Unit): (fileName: String, content: String) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentOnResult by rememberUpdatedState(onResult)
    // The picker only hands back a destination URI, so the content waits here in the meantime.
    // Not saveable state: if the process dies while the picker is open, the trainee just taps
    // Export again.
    val pendingContent = remember { arrayOfNulls<String>(1) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val content = pendingContent[0]
        pendingContent[0] = null
        if (uri == null || content == null) {
            currentOnResult(FileSaveResult.CANCELLED)
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            val saved = withContext(Dispatchers.IO) {
                runCatching {
                    // "wt": truncate, in case the trainee picked an existing, longer file.
                    context.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(content.encodeToByteArray()) }
                }.isSuccess
            }
            currentOnResult(if (saved) FileSaveResult.SAVED else FileSaveResult.FAILED)
        }
    }

    return remember(launcher) {
        { fileName, content ->
            pendingContent[0] = content
            launcher.launch(fileName)
        }
    }
}
