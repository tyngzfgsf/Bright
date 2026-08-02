package com.bright.app.domain.model

/** Supported app + AI languages. Add new entries here to support more languages later. */
enum class Language(val code: String, val displayName: String) {
    ENGLISH("en", "English"),
    KOREAN("ko", "한국어");

    companion object {
        fun fromCode(code: String?): Language =
            entries.firstOrNull { it.code == code } ?: ENGLISH

        /** Maps the device's system locale to a supported language, defaulting to English. */
        fun fromSystemDefault(): Language {
            val systemLangCode = java.util.Locale.getDefault().language
            return entries.firstOrNull { it.code == systemLangCode } ?: ENGLISH
        }
    }
}
