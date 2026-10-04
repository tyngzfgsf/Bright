package com.bright.app.util

import java.text.DateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Date

actual fun currentTimeMillis(): Long = System.currentTimeMillis()

actual fun formatSessionTimestamp(epochMillis: Long): String =
    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(epochMillis))

actual fun currentLocalEpochDay(): Long = LocalDate.now().toEpochDay()

actual fun formatDate(epochMillis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))

actual fun localTimeMillis(daysFromToday: Long, hour: Int, minute: Int): Long =
    LocalDate.now().plusDays(daysFromToday).atTime(hour, minute)
        .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

actual fun localDaysFromToday(epochMillis: Long): Long =
    ChronoUnit.DAYS.between(
        LocalDate.now(),
        Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDate()
    )

actual fun formatIsoTimestamp(epochMillis: Long): String =
    Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toOffsetDateTime().toString()
