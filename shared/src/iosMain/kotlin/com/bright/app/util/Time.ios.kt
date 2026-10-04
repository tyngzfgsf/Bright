package com.bright.app.util

import platform.Foundation.NSCalendar
import platform.Foundation.NSCalendarUnitDay
import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.NSDateFormatterMediumStyle
import platform.Foundation.NSDateFormatterNoStyle
import platform.Foundation.NSDateFormatterShortStyle
import platform.Foundation.NSISO8601DateFormatter
import platform.Foundation.NSTimeZone
import platform.Foundation.localTimeZone
import platform.Foundation.dateWithTimeIntervalSince1970
import platform.Foundation.timeIntervalSince1970

actual fun currentTimeMillis(): Long = (NSDate().timeIntervalSince1970 * 1000).toLong()

/**
 * Local midnight's own timestamp, divided into whole days. `startOfDayForDate` is DST-aware
 * (it returns the real local midnight instant for today, whatever that day's actual length
 * is), so this only mis-numbers a day in the rare case a DST shift lands exactly on a 86400s
 * boundary — an acceptable trade-off for a decorative streak counter with no backend to
 * reconcile against.
 */
actual fun currentLocalEpochDay(): Long {
    val startOfToday = NSCalendar.currentCalendar.startOfDayForDate(NSDate())
    return (startOfToday.timeIntervalSince1970 / 86400.0).toLong()
}

/** Medium date + short time, matching the Android side's DateFormat.MEDIUM/SHORT pairing. */
actual fun formatSessionTimestamp(epochMillis: Long): String {
    val formatter = NSDateFormatter().apply {
        dateStyle = NSDateFormatterMediumStyle
        timeStyle = NSDateFormatterShortStyle
    }
    return formatter.stringFromDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0))
}

actual fun formatDate(epochMillis: Long): String {
    val formatter = NSDateFormatter().apply {
        dateStyle = NSDateFormatterMediumStyle
        timeStyle = NSDateFormatterNoStyle
    }
    return formatter.stringFromDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0))
}

actual fun localTimeMillis(daysFromToday: Long, hour: Int, minute: Int): Long {
    val calendar = NSCalendar.currentCalendar
    val day = calendar.dateByAddingUnit(NSCalendarUnitDay, daysFromToday, NSDate(), 0u)!!
    val target = calendar.dateBySettingHour(hour.toLong(), minute.toLong(), 0, day, 0u)!!
    return (target.timeIntervalSince1970 * 1000).toLong()
}

actual fun localDaysFromToday(epochMillis: Long): Long {
    val calendar = NSCalendar.currentCalendar
    val today = calendar.startOfDayForDate(NSDate())
    val other = calendar.startOfDayForDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0))
    return calendar.components(NSCalendarUnitDay, today, other, 0u).day
}

actual fun formatIsoTimestamp(epochMillis: Long): String {
    val formatter = NSISO8601DateFormatter().apply { timeZone = NSTimeZone.localTimeZone }
    return formatter.stringFromDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0))
}
