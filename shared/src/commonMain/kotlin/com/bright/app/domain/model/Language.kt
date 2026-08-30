package com.bright.app.domain.model

/**
 * The device's current system language code (e.g. "en", "ko"), platform-native lookup.
 * `java.util.Locale` isn't available outside the JVM, so each platform supplies its own.
 */
expect fun currentSystemLanguageCode(): String

/** Supported app + AI languages. Add new entries here to support more languages later. */
enum class Language(val code: String, val displayName: String) {
    ENGLISH("en", "English"),
    KOREAN("ko", "한국어");

    companion object {
        fun fromCode(code: String?): Language =
            entries.firstOrNull { it.code == code } ?: ENGLISH

        /** Maps the device's system locale to a supported language, defaulting to English. */
        fun fromSystemDefault(): Language {
            val systemLangCode = currentSystemLanguageCode()
            return entries.firstOrNull { it.code == systemLangCode } ?: ENGLISH
        }
    }
}
