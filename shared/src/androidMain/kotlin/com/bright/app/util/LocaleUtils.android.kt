package com.bright.app.util

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.bright.app.domain.model.Language

actual object LocaleUtils {
    actual fun applyLanguage(language: Language) {
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(language.code)
        )
    }
}
