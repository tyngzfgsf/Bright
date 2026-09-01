package com.bright.app.data.share

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Writes the PNG into `cacheDir/updates` — reusing the existing `file_paths.xml` entry
 * (`<cache-path name="updates" path="." />`, which covers all of `cacheDir`) rather than adding
 * a second FileProvider path just for this.
 */
class AndroidImageSharer(private val context: Context) : ImageSharer {

    override suspend fun share(bitmap: ImageBitmap, fileName: String): String? =
        withContext(Dispatchers.IO) {
            try {
                val file = File(context.cacheDir, fileName)
                file.outputStream().use { out ->
                    bitmap.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, out)
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(sendIntent, null).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(chooser)
                null
            } catch (e: Exception) {
                e.message ?: "Couldn't share the image."
            }
        }
}
