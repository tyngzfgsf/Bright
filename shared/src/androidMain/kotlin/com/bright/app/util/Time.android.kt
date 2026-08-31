package com.bright.app.util

import java.text.DateFormat
import java.time.LocalDate
import java.util.Date

actual fun currentTimeMillis(): Long = System.currentTimeMillis()

actual fun formatSessionTimestamp(epochMillis: Long): String =
    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(epochMillis))

actual fun currentLocalEpochDay(): Long = LocalDate.now().toEpochDay()
