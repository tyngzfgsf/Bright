package com.bright.app.util

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.bright.app.domain.model.Language

object LocaleUtils {
    /** Applies the given language app-wide. Triggers an automatic activity recreation. */
    fun applyLanguage(language: Language) {
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(language.code)
        )
    }
}
