package com.bright.app.domain.model

import platform.Foundation.NSLocale
import platform.Foundation.preferredLanguages

/**
 * Uses `NSLocale.preferredLanguages`, deliberately not `NSLocale.currentLocale.languageCode`.
 *
 * `currentLocale` is filtered by the localizations the *app bundle declares*: with an English
 * development region and no `.lproj` folders, it reports "en" even on a fully Korean device.
 * That produced a real, visible inconsistency — Compose Resources (which resolves against
 * `preferredLanguages`) rendered Korean while `Language.fromSystemDefault()` reported English
 * on the very same screen.
 *
 * `preferredLanguages` is the user's actual language preference order, which is what
 * localization resolves against, so this now agrees with what the UI displays. Entries are
 * BCP-47 tags like "ko-KR", hence taking the subtag before the separator.
 */
actual fun currentSystemLanguageCode(): String {
    val preferred = NSLocale.preferredLanguages.firstOrNull() as? String ?: return "en"
    return preferred.substringBefore('-').substringBefore('_')
}
