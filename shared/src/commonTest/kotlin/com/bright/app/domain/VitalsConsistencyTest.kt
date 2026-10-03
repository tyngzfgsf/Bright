package com.bright.app.domain

import com.bright.app.domain.model.Language
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class VitalsConsistencyTest {

    // Real readings from an on-device anaphylaxis run, where the model wrote the second one under
    // an "Improving" chip.
    private val first = "HR 122 · BP 78/48 · RR 30 · SpO2 88% · T 37.9°C · GCS 15"
    private val worseUnderImproving = "HR 138 · BP 70/40 · RR 34 · SpO2 82% · T 38.2°C · GCS 14"
    private val better = "HR 104 · BP 96/60 · RR 22 · SpO2 94% · T 37.8°C · GCS 15"

    @Test
    fun worseNumbersUnderAnImprovingTrendAreRejected() {
        assertTrue(VitalsConsistency.contradicts(VitalsTrend.IMPROVING, first, worseUnderImproving))
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.WORSENING, first, worseUnderImproving))
    }

    @Test
    fun betterNumbersUnderAWorseningTrendAreRejected() {
        assertTrue(VitalsConsistency.contradicts(VitalsTrend.WORSENING, first, better))
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.IMPROVING, first, better))
    }

    @Test
    fun directionIsDistanceFromNormalNotRawUpOrDown() {
        // Hypertensive stroke: BP falling from 210 to 170 is an improvement.
        val high = "HR 96 · BP 210/120 · RR 18 · SpO2 97% · GCS 13"
        val lower = "HR 92 · BP 170/100 · RR 18 · SpO2 97% · GCS 14"
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.IMPROVING, high, lower))
        assertTrue(VitalsConsistency.contradicts(VitalsTrend.WORSENING, high, lower))
    }

    @Test
    fun noPreviousReadingUnparseableOrFlatTrendsNeverContradict() {
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.IMPROVING, null, worseUnderImproving))
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.IMPROVING, first, "HR no pulse · BP unrecordable"))
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.UNCHANGED, first, worseUnderImproving))
        assertFalse(VitalsConsistency.contradicts(VitalsTrend.BASELINE, first, better))
    }

    @Test
    fun vitalsPromptSpellsOutDirectionAndPulselessFormat() {
        val text = ScenarioPromptBuilder.vitalsCheckPrompt(VitalsTrend.IMPROVING, ScenarioState.OPENING, first, Language.ENGLISH)
        assertTrue("SpO2 and GCS higher" in text)
        assertTrue("earlier messages described deterioration" in text)
        assertTrue("\"no pulse\"" in text)
        assertTrue(PatientStage.entries.none { "deteriorat" in it.promptLabel }, "stage labels must not imply direction")
    }
}
