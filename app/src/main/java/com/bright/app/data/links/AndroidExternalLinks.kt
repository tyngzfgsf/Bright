package com.bright.app.data.links

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Opens links in whatever app handles them — the Play Store app for its subscription page. */
class AndroidExternalLinks(private val context: Context) : ExternalLinks {
    override fun open(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            // No browser at all: nothing sensible to fall back to, and nothing to crash over.
        }
    }
}
