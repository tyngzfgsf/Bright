package com.bright.app.data.links

/**
 * Opens a URL outside the app: a store's subscription-management page, or (only in builds not
 * distributed through an app store) the website's checkout. Platform-specific, like
 * [com.bright.app.data.share.ImageSharer].
 */
interface ExternalLinks {
    fun open(url: String)
}
