package com.bright.app.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/** AVPU, as the server's rules engine reports it. */
enum class Consciousness(val wire: String) {
    ALERT("alert"),
    VERBAL("verbal"),
    PAIN("pain"),
    UNRESPONSIVE("unresponsive");

    companion object {
        fun fromWire(value: String?): Consciousness? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * The patient monitor as the server-side rules engine last computed it (the `state` object of a `sim`
 * response). Display only: the app never derives or changes these numbers, and the server never sends
 * the hidden parts of the state (flags, action log, rules).
 */
data class PatientVitals(
    val turn: Int,
    val clockSeconds: Int,
    val heartRate: Int,
    val systolic: Int,
    val diastolic: Int,
    val spo2: Int,
    val respiratoryRate: Int,
    val consciousness: Consciousness
) {
    /** Simulated time since the scenario began, as m:ss. */
    val clockText: String get() = "${clockSeconds / 60}:${(clockSeconds % 60).toString().padStart(2, '0')}"
}

object PatientVitalsParser {

    // Same physiological bounds the server clamps to; anything outside means a corrupt payload.
    private val HR = 0..250
    private val SBP = 0..260
    private val DBP = 0..160
    private val SPO2 = 0..100
    private val RR = 0..60

    private val json = Json { isLenient = false }

    /** Null when the payload is not a complete, in-range monitor state. Unknown extra keys are ignored. */
    fun parse(raw: String): PatientVitals? {
        val obj = runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: return null
        return fromJson(obj)
    }

    fun fromJson(obj: JsonObject): PatientVitals? {
        fun int(key: String, range: IntRange): Int? {
            val p = obj[key] as? JsonPrimitive ?: return null
            if (p.isString) return null
            return p.intOrNull?.takeIf { it in range }
        }
        return PatientVitals(
            turn = int("turn", 0..100_000) ?: return null,
            clockSeconds = int("clock_s", 0..10_000_000) ?: return null,
            heartRate = int("hr", HR) ?: return null,
            systolic = int("sbp", SBP) ?: return null,
            diastolic = int("dbp", DBP) ?: return null,
            spo2 = int("spo2", SPO2) ?: return null,
            respiratoryRate = int("rr", RR) ?: return null,
            consciousness = Consciousness.fromWire((obj["consciousness"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
                ?: return null
        )
    }
}
