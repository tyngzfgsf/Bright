package com.bright.app.data.share

import androidx.compose.ui.graphics.ImageBitmap

/**
 * Hands a rendered [ImageBitmap] off to the platform's native share sheet (Android's chooser,
 * iOS's `UIActivityViewController`). Each platform owns how the bitmap gets encoded and how the
 * sheet is presented — there's no shared UI here, just the one call screens need.
 */
interface ImageSharer {
    /** Returns an error message on failure, or null on success (sheet was presented/dismissed). */
    suspend fun share(bitmap: ImageBitmap, fileName: String): String?
}
