package com.bright.app.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.sign

/** One vitals check as the model wrote it. [displayText] is what gets stored and shown. */
data class VitalsReading(val vitals: String, val response: String?) {
    val displayText: String get() = listOfNotNull(vitals, response).joinToString("\n")
}

/**
 * Catches a reading whose numbers move against the trend the app decided — the model writing
 * worse vitals under an "Improving" chip. Direction is judged as distance from the normal range,
 * not raw up/down, so a hypertensive stroke patient's falling BP counts as better. SpO2 and GCS
 * only get worse by falling. Parameters missing from either reading ("no pulse") are skipped.
 */
object VitalsConsistency {

    private data class Values(val hr: Int?, val sbp: Int?, val rr: Int?, val spo2: Int?, val gcs: Int?)

    private fun number(text: String, pattern: String): Int? =
        Regex(pattern, RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.toIntOrNull()

    private fun parse(text: String) = Values(
        hr = number(text, """\bHR\s*:?\s*(\d{2,3})\b"""),
        sbp = number(text, """\bBP\s*:?\s*(\d{2,3})\s*/"""),
        rr = number(text, """\bRR\s*:?\s*(\d{1,2})\b"""),
        spo2 = number(text, """\bSpO2\s*:?\s*(\d{2,3})"""),
        gcs = number(text, """\bGCS\s*:?\s*(\d{1,2})\b""")
    )

    private fun outsideRange(value: Int, low: Int, high: Int): Int = when {
        value < low -> low - value
        value > high -> value - high
        else -> 0
    }

    /** Parameters that moved toward normal minus those that moved away. Positive = net better. */
    fun netChange(previous: String, current: String): Int {
        val a = parse(previous)
        val b = parse(current)
        var net = 0
        fun compare(before: Int?, after: Int?, low: Int, high: Int) {
            if (before != null && after != null) net += (outsideRange(before, low, high) - outsideRange(after, low, high)).sign
        }
        compare(a.hr, b.hr, 60, 100)
        compare(a.sbp, b.sbp, 90, 140)
        compare(a.rr, b.rr, 12, 20)
        compare(a.spo2, b.spo2, 95, 100)
        compare(a.gcs, b.gcs, 15, 15)
        return net
    }

    fun contradicts(trend: VitalsTrend, previous: String?, current: String): Boolean {
        if (previous == null) return false
        return when (trend) {
            VitalsTrend.IMPROVING -> netChange(previous, current) < 0
            VitalsTrend.WORSENING -> netChange(previous, current) > 0
            VitalsTrend.BASELINE, VitalsTrend.UNCHANGED -> false
        }
    }
}

object VitalsReadingParser {

    private val json = Json { isLenient = true }

    /**
     * Forgiving in the same spirit as [AiTurnParser]: a fence or stray sentence around the
     * object, vitals as a nested object (`{"HR": 118, "BP": "86/52"}`) instead of one line,
     * a missing "response". With no usable object at all, the raw text is the reading — a
     * vitals check should never come back blank.
     */
    fun parse(raw: String): VitalsReading {
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        val obj = if (start in 0 until end) {
            runCatching { json.parseToJsonElement(raw.substring(start, end + 1)) as? JsonObject }.getOrNull()
        } else {
            null
        }
        val fields = obj?.entries?.associate { (key, value) -> key.lowercase() to value }
        val vitals = fields?.get("vitals")?.let(::lineFrom)
            ?: return VitalsReading(vitals = raw.trim(), response = null)
        return VitalsReading(vitals = vitals, response = fields["response"]?.let(::lineFrom))
    }

    private fun lineFrom(element: JsonElement): String? = when (element) {
        is JsonNull -> null
        is JsonPrimitive -> element.content.trim().takeIf { it.isNotEmpty() }
        is JsonArray -> element.mapNotNull(::lineFrom).joinToString(" · ").takeIf { it.isNotEmpty() }
        is JsonObject -> element.entries
            .mapNotNull { (key, value) -> lineFrom(value)?.let { "$key $it" } }
            .joinToString(" · ")
            .takeIf { it.isNotEmpty() }
    }
}
