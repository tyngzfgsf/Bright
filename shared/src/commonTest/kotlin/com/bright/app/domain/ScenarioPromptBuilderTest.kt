package com.bright.app.domain

import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.ScoringCriteria
import com.bright.app.domain.model.TraineeRole
import com.bright.app.domain.model.TriageSystem
import kotlin.test.Test
import kotlin.test.assertTrue

class ScenarioPromptBuilderTest {

    private fun prompt(
        system: TriageSystem,
        scenario: ScenarioType?,
        language: Language = Language.ENGLISH,
        state: ScenarioState = ScenarioState.OPENING
    ) =
        ScenarioPromptBuilder.buildSystemPrompt(
            scenarioDescription = scenario?.promptKeyword ?: "a custom case",
            aiRoleDescription = "the patient",
            traineeRole = TraineeRole.NURSE,
            difficulty = Difficulty.INTERMEDIATE,
            language = language,
            triageSystem = system,
            criteria = ScoringCriteria.offeredFor(system, scenario),
            state = state
        )

    @Test
    fun decompensationOffSaysTimeDoesNotWorsenThePatient() {
        val text = prompt(TriageSystem.KTAS, ScenarioType.SEPSIS)
        assertTrue("Time-based deterioration is OFF" in text)
        assertTrue("[CHECK_VITALS]" in text)
        // The reference list stays last, so criteria parsing expectations are unchanged.
        assertTrue(text.indexOf("SCENARIO CLOCK") < text.indexOf("REFERENCE ("))
    }

    @Test
    fun lateAnswerWithDecompensationForcesTheNextStageButNotTheScore() {
        val state = ScenarioState(
            elapsedMinutes = 6, decompensationEnabled = true, stage = PatientStage.WORSENING,
            pendingSeconds = null, lateAfterSeconds = 90, answerSeconds = 140
        )
        val text = prompt(TriageSystem.ESI, ScenarioType.ANAPHYLAXIS, state = state)
        assertTrue("T+6 min" in text)
        assertTrue("140 s after your question (limit 90 s): LATE" in text)
        assertTrue("deteriorated to CRITICAL" in text)
        assertTrue("never deduct points for timing" in text)
    }

    @Test
    fun onTimeAnswerOffersBothOutcomes() {
        val state = ScenarioState(2, true, PatientStage.WORSENING, null, 90, answerSeconds = 30)
        val text = prompt(TriageSystem.ESI, ScenarioType.TRAUMA, state = state)
        assertTrue("deteriorates to CRITICAL" in text && "improves to STABLE" in text)
    }

    @Test
    fun vitalsPromptCarriesTheOnDeviceTrendAndPreviousReading() {
        val text = ScenarioPromptBuilder.vitalsCheckPrompt(
            VitalsTrend.WORSENING, ScenarioState.OPENING, "HR 120 · BP 90/60", Language.KOREAN
        )
        assertTrue(text.startsWith("[CHECK_VITALS]"))
        assertTrue("Nothing may improve" in text)
        assertTrue("HR 120 · BP 90/60" in text)
        assertTrue("\"vitals\"" in text && "한국어" in text)
    }

    @Test
    fun vitalsParserHandlesObjectsFencesAndPlainText() {
        val nested = VitalsReadingParser.parse("```json\n{\"vitals\": {\"HR\": 130, \"BP\": \"80/40\"}, \"response\": \"Pale.\"}\n```")
        assertTrue(nested.vitals == "HR 130 · BP 80/40" && nested.response == "Pale.", nested.toString())
        val plain = VitalsReadingParser.parse("HR 88, BP 120/80")
        assertTrue(plain.vitals == "HR 88, BP 120/80" && plain.response == null)
    }

    @Test
    fun asksForTheBasisAndListsExactlyTheOfferedCriteria() {
        val text = prompt(TriageSystem.KTAS, ScenarioType.ANAPHYLAXIS)
        assertTrue("\"basis\"" in text)
        for (criterion in ScoringCriteria.offeredFor(TriageSystem.KTAS, ScenarioType.ANAPHYLAXIS)) {
            assertTrue("\n${criterion.id} | " in text, "missing ${criterion.id}")
        }
        assertTrue("ESI-2-HIGH-RISK" !in text, "other triage system leaked in")
        assertTrue("BURNS-COOLING" !in text, "other scenario's protocol leaked in")
        assertTrue("KTAS Level 1 | " in text)
    }

    @Test
    fun templateIndentIsStillTrimmed() {
        // The reference block is appended after trimIndent; if it were interpolated, every
        // template line would keep its source indentation.
        val text = prompt(TriageSystem.ESI, null)
        assertTrue(text.startsWith("You are the question engine"), text.take(40))
        assertTrue(text.lines().none { it.startsWith("            ") })
    }

    @Test
    fun koreanPromptKeepsIdsUntranslated() {
        val text = prompt(TriageSystem.KTAS, ScenarioType.STROKE, Language.KOREAN)
        assertTrue("never translate it" in text)
        assertTrue("\nSTROKE-THROMBOLYSIS | AHA/ASA | " in text)
    }
}
