package com.bright.app.util

import kotlin.math.abs
import kotlin.math.floor

/**
 * Formats a score as a one-decimal string, e.g. `5.5`.
 *
 * Kotlin has no multiplatform `String.format`, and Compose Resources does not honour printf
 * precision specifiers — `%1$.1f` in a resource string is emitted verbatim rather than
 * substituted, which is exactly how "Average score: %1$.1f/10" ended up on screen. So the
 * rounding happens here and the resource takes a plain `%1$s`.
 *
 * This replaces `String.format(Locale.US, "%.1f", …)` at the call sites, which worked but is
 * JVM-only and would have blocked those screens from moving to `commonMain`.
 */
fun Double.toScoreString(): String {
    // floor(x + 0.5) on the magnitude, deliberately not kotlin.math.round: round() breaks ties
    // to even, so 5.25 became "5.2" where the previous String.format("%.1f") gave "5.3". Halves
    // round away from zero here, matching what users saw before.
    val magnitude = floor(abs(this) * 10 + 0.5).toLong()
    val sign = if (this < 0) "-" else ""
    return "$sign${magnitude / 10}.${magnitude % 10}"
}
