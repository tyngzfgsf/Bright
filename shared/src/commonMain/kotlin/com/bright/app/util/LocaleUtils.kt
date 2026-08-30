package com.bright.app.util

import com.bright.app.domain.model.Language

/**
 * Applies the given language app-wide.
 *
 * Android and iOS genuinely behave differently here, not just in implementation: Android's
 * AppCompatDelegate.setApplicationLocales takes effect immediately (via an automatic activity
 * recreation). iOS has no public live-locale-override API — the standard workaround only takes
 * effect on next launch. See the iosMain actual for what that means for callers.
 */
expect object LocaleUtils {
    fun applyLanguage(language: Language)
}
