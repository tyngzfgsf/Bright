package com.bright.app.ui.export

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import platform.Foundation.NSString
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.create
import platform.Foundation.writeToFile
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication

/**
 * Same file-URL-into-the-share-sheet approach as `IosImageSharer`; the sheet's own "Save to
 * Files" action is iOS's equivalent of Android's save-as picker.
 */
@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
@Composable
actual fun rememberJsonFileSaver(onResult: (FileSaveResult) -> Unit): (fileName: String, content: String) -> Unit {
    val currentOnResult by rememberUpdatedState(onResult)
    return remember {
        { fileName, content ->
            val path = NSTemporaryDirectory() + fileName
            val written = NSString.create(string = content)
                .writeToFile(path, atomically = true, encoding = NSUTF8StringEncoding, error = null)
            val rootViewController = UIApplication.sharedApplication.keyWindow?.rootViewController
            if (!written || rootViewController == null) {
                currentOnResult(FileSaveResult.FAILED)
            } else {
                val sheet = UIActivityViewController(
                    activityItems = listOf(NSURL.fileURLWithPath(path)),
                    applicationActivities = null
                )
                sheet.completionWithItemsHandler = { _, completed, _, error ->
                    currentOnResult(
                        when {
                            error != null -> FileSaveResult.FAILED
                            completed -> FileSaveResult.SAVED
                            else -> FileSaveResult.CANCELLED
                        }
                    )
                }
                rootViewController.presentViewController(sheet, animated = true, completion = null)
            }
        }
    }
}
