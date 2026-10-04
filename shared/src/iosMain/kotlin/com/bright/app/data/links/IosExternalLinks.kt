package com.bright.app.data.links

import platform.Foundation.NSURL
import platform.UIKit.UIApplication

/** Opens links outside the app — the App Store's subscription page, for one. */
class IosExternalLinks : ExternalLinks {
    override fun open(url: String) {
        val nsUrl = NSURL.URLWithString(url) ?: return
        UIApplication.sharedApplication.openURL(nsUrl, options = emptyMap<Any?, Any>(), completionHandler = null)
    }
}
