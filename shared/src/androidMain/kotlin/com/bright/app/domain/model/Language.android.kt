package com.bright.app.domain.model

import java.util.Locale

actual fun currentSystemLanguageCode(): String = Locale.getDefault().language
