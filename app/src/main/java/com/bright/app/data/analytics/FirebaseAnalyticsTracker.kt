package com.bright.app.data.analytics

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Sends [AnalyticsEvent]s to Firebase Analytics (free on the Spark plan — no Blaze, no Cloud
 * Functions). What gets sent is fixed by [AnalyticsEvent]'s types; this class only translates
 * values into a Bundle. Advertising-ID collection is turned off in the manifest.
 */
class FirebaseAnalyticsTracker(context: Context) : Analytics {

    private val firebase = FirebaseAnalytics.getInstance(context)

    override fun log(event: AnalyticsEvent) {
        val bundle = Bundle()
        event.params.forEach { (key, value) ->
            when (value) {
                is String -> bundle.putString(key, value)
                is Long -> bundle.putLong(key, value)
                is Int -> bundle.putLong(key, value.toLong())
                is Double -> bundle.putDouble(key, value)
                // Firebase has no boolean parameter type; 0/1 stays filterable in reports.
                is Boolean -> bundle.putLong(key, if (value) 1L else 0L)
            }
        }
        firebase.logEvent(event.name, bundle)
    }
}
