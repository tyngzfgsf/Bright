package com.bright.app.util

/** Wall-clock time in epoch milliseconds — the multiplatform stand-in for `System.currentTimeMillis()`. */
expect fun currentTimeMillis(): Long

/**
 * A session's timestamp, formatted for display in the user's locale (e.g. "Aug 31, 2026 8:15 AM").
 *
 * `expect`/`actual` rather than a shared formatter: date/time formatting is exactly the kind of
 * thing each platform already does well and locale-correctly (Android's `DateFormat`, iOS's
 * `NSDateFormatter`), and hand-rolling it in common code would produce something worse in every
 * locale.
 */
expect fun formatSessionTimestamp(epochMillis: Long): String
