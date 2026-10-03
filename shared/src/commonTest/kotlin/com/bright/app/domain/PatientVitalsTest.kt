package com.bright.app.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class PatientVitalsTest {

    private fun payload(
        hr: String = "118", sbp: String = "98", dbp: String = "60", spo2: String = "93", rr: String = "24",
        consciousness: String = "\"alert\"", turn: String = "1", clock: String = "60", extra: String = ""
    ) = """{"turn":$turn,"clock_s":$clock,"hr":$hr,"sbp":$sbp,"dbp":$dbp,"spo2":$spo2,"rr":$rr,"consciousness":$consciousness$extra}"""

    @Test
    fun parsesTheServersPublicState() {
        val v = assertNotNull(PatientVitalsParser.parse(payload()))
        assertEquals(PatientVitals(1, 60, 118, 98, 60, 93, 24, Consciousness.ALERT), v)
    }

    @Test
    fun unknownExtraKeysAreIgnored() {
        assertNotNull(PatientVitalsParser.parse(payload(extra = ""","future_field":{"x":1}""")))
    }

    @Test
    fun everyConsciousnessLevelParses() {
        for (c in Consciousness.entries) {
            assertEquals(c, PatientVitalsParser.parse(payload(consciousness = "\"${c.wire}\""))?.consciousness)
        }
    }

    @Test
    fun clockTextIsMinutesAndPaddedSeconds() {
        assertEquals("1:00", PatientVitalsParser.parse(payload(clock = "60"))?.clockText)
        assertEquals("0:05", PatientVitalsParser.parse(payload(clock = "5"))?.clockText)
        assertEquals("12:34", PatientVitalsParser.parse(payload(clock = "754"))?.clockText)
    }

    @Test
    fun corruptOrOutOfRangePayloadsAreRejectedNotGuessed() {
        val bad = listOf(
            "", "null", "[]", "not json", "{}",
            payload(hr = "-1"), payload(hr = "251"), payload(sbp = "261"), payload(dbp = "161"),
            payload(spo2 = "101"), payload(rr = "61"), payload(turn = "-1"), payload(clock = "-5"),
            payload(hr = "\"118\""), payload(hr = "118.5"), payload(hr = "null"),
            payload(consciousness = "\"asleep\""), payload(consciousness = "1"), payload(consciousness = "null"),
            """{"turn":1,"clock_s":60,"hr":118}"""
        )
        for (raw in bad) assertNull(PatientVitalsParser.parse(raw), raw)
    }

    @Test
    fun consciousnessFromWireIsExactMatchOnly() {
        assertNull(Consciousness.fromWire("Alert"))
        assertNull(Consciousness.fromWire(null))
        assertEquals(Consciousness.UNRESPONSIVE, Consciousness.fromWire("unresponsive"))
    }
}
