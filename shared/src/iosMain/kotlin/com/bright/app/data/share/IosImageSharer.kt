package com.bright.app.data.share

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asSkiaBitmap
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jetbrains.skia.EncodedImageFormat
import org.jetbrains.skia.Image
import platform.Foundation.NSData
import platform.Foundation.NSFileManager
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.create
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication

/**
 * Compose Multiplatform on iOS is Skia-backed, so the bitmap is encoded to PNG via Skia rather
 * than any UIKit imaging API, then handed to the standard share sheet as a file URL (simpler
 * than bridging raw NSData through as an activity item).
 */
@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
class IosImageSharer : ImageSharer {

    override suspend fun share(bitmap: ImageBitmap, fileName: String): String? {
        val encoded = Image.makeFromBitmap(bitmap.asSkiaBitmap())
            .encodeToData(EncodedImageFormat.PNG)
            ?: return "Couldn't render the image."

        val path = NSTemporaryDirectory() + fileName
        val bytes = encoded.bytes
        val nsData = bytes.usePinned { pinned ->
            NSData.create(bytes = pinned.addressOf(0), length = bytes.size.toULong())
        }
        if (!NSFileManager.defaultManager.createFileAtPath(path, contents = nsData, attributes = null)) {
            return "Couldn't save the image."
        }

        return withContext(Dispatchers.Main) {
            val rootViewController = UIApplication.sharedApplication.keyWindow?.rootViewController
                ?: return@withContext "Nothing to share to."
            val activityViewController = UIActivityViewController(
                activityItems = listOf(NSURL.fileURLWithPath(path)),
                applicationActivities = null
            )
            rootViewController.presentViewController(activityViewController, animated = true, completion = null)
            null
        }
    }
}
