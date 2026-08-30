package com.bright.app.domain.model

import platform.Foundation.NSLocale
import platform.Foundation.currentLocale
import platform.Foundation.languageCode

actual fun currentSystemLanguageCode(): String = NSLocale.currentLocale.languageCode
