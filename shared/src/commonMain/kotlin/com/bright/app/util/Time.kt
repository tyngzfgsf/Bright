package com.bright.app.util

/** Wall-clock time in epoch milliseconds — the multiplatform stand-in for `System.currentTimeMillis()`. */
expect fun currentTimeMillis(): Long

/**
 * The trainee's current *local calendar* day, as a day-count (not epoch millis) — used for the
 * daily streak, where "today" needs to mean the device's local day regardless of timezone, and
 * "yesterday"/"today" comparisons need to be exact day arithmetic, not a raw millis subtraction
 * (which breaks around DST). Only ever compared against previously-stored values from the same
 * device, so the two platforms' numbering schemes don't need to agree with each other.
 */
expect fun currentLocalEpochDay(): Long

/**
 * A session's timestamp, formatted for display in the user's locale (e.g. "Aug 31, 2026 8:15 AM").
 *
 * `expect`/`actual` rather than a shared formatter: date/time formatting is exactly the kind of
 * thing each platform already does well and locale-correctly (Android's `DateFormat`, iOS's
 * `NSDateFormatter`), and hand-rolling it in common code would produce something worse in every
 * locale.
 */
expect fun formatSessionTimestamp(epochMillis: Long): String
