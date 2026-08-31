package com.bright.app.util

import platform.Foundation.NSCalendar
import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.NSDateFormatterMediumStyle
import platform.Foundation.NSDateFormatterShortStyle
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
