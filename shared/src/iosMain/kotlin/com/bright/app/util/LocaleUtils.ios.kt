package com.bright.app.util

import com.bright.app.domain.model.Language
import platform.Foundation.NSUserDefaults

actual object LocaleUtils {
    /**
     * iOS has no live-locale-override API like Android's AppCompatDelegate. Overriding the
     * "AppleLanguages" default is the standard workaround (same technique apps like Twitter/X
     * and countless others use for an in-app language picker), but it only takes effect on the
     * *next* launch — NSLocalizedString and friends keep resolving against the old language
     * until then. Whatever calls this on iOS needs to prompt the user to relaunch; there is no
     * way around that restart with public API. That UI prompt belongs in Phase 6 (the iOS app
     * shell), not here — this function only records the preference.
     */
    actual fun applyLanguage(language: Language) {
        NSUserDefaults.standardUserDefaults.setObject(listOf(language.code), forKey = "AppleLanguages")
        NSUserDefaults.standardUserDefaults.synchronize()
    }
}
