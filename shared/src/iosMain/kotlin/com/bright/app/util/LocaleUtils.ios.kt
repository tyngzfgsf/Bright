package com.bright.app.util

import com.bright.app.domain.model.Language
import platform.Foundation.NSUserDefaults

actual object LocaleUtils {
    /**
     * Records the language preference. It takes effect on the **next launch**, not immediately.
     *
     * To be precise about why, because the earlier version of this comment overstated it: iOS
     * apps *can* switch language live in general — with a custom string layer, or SwiftUI's
     * `.environment(\.locale)`. The blocker here is specific to this stack. Bright's strings come
     * from Compose Multiplatform Resources, which resolves against the system locale, and the API
     * for overriding that (`LocalComposeEnvironment` / `ResourceEnvironment`) is `internal` in
     * every Compose Multiplatform release compatible with this project's Kotlin version —
     * checked against 1.8.2 and 1.9.3. See JetBrains/compose-multiplatform#4197.
     *
     * Overriding "AppleLanguages" is the standard workaround and is what makes the next launch
     * come up in the chosen language. Settings surfaces a restart note on iOS
     * (see BrightDependencies.languageChangeRequiresRestart) so the picker doesn't look inert.
     */
    actual fun applyLanguage(language: Language) {
        NSUserDefaults.standardUserDefaults.setObject(listOf(language.code), forKey = "AppleLanguages")
        NSUserDefaults.standardUserDefaults.synchronize()
    }
}
