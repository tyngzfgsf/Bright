package com.bright.app.util

import android.content.Context
import android.telephony.TelephonyManager
import java.util.Locale

/**
 * Where the device physically is, for local-currency pricing: the mobile network's country
 * first (follows the trainee when they travel), then the SIM's, then the locale's region as a
 * last resort for Wi-Fi-only devices. Deliberately not the app language — a Korean speaker in
 * Cape Town should see rand.
 *
 * Needs no permission; none of these reads count as location data in Android's permission model.
 */
fun regionCountryCode(context: Context): String? {
    val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    return listOfNotNull(
        telephony?.networkCountryIso,
        telephony?.simCountryIso,
        Locale.getDefault().country
    ).firstOrNull { it.length == 2 }?.uppercase()
}
