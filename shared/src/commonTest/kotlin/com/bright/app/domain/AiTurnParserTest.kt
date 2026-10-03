package com.bright.app.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The shapes real models have actually been seen to return, or plausibly will. The contract:
 * a turn is never lost to one odd field, and nothing that isn't a turn is read as one.
 */
class AiTurnParserTest {

    @Test
    fun cleanTurnWithCitation() {
        val turn = AiTurnParser.parse(
            """{"score": 8, "feedback": "Good.", "basis": "ESI-2-HIGH-RISK", "next_prompt": "Next?", "session_complete": false}"""
        )
        assertEquals(8, turn.score)
        assertEquals("Good.", turn.feedback)
        assertEquals("ESI-2-HIGH-RISK", turn.basis)
        assertEquals("Next?", turn.nextPrompt)
        assertFalse(turn.sessionComplete)
    }

    @Test
    fun fencedWithProseAroundIt() {
        val turn = AiTurnParser.parse(
            "Here's my grading:\n```json\n{\"score\": 6, \"feedback\": \"Close.\", \"basis\": \"CPR-QUALITY\", \"next_prompt\": \"What now?\"}\n```\nHope that helps!"
        )
        assertEquals(6, turn.score)
        assertEquals("CPR-QUALITY", turn.basis)
        assertEquals("What now?", turn.nextPrompt)
    }

    @Test
    fun scoreInOtherShapes() {
        assertEquals(7, AiTurnParser.parse("""{"score": "7/10", "next_prompt": "q"}""").score)
        assertEquals(7, AiTurnParser.parse("""{"score": "7", "next_prompt": "q"}""").score)
        assertEquals(8, AiTurnParser.parse("""{"score": 7.5, "next_prompt": "q"}""").score)
        assertEquals(9, AiTurnParser.parse("""{"score": " 9 / 10 ", "next_prompt": "q"}""").score)
    }

    @Test
    fun outOfRangeOrWordyScoreIsDroppedNotClamped() {
        assertNull(AiTurnParser.parse("""{"score": 15, "next_prompt": "q"}""").score)
        assertNull(AiTurnParser.parse("""{"score": 70, "next_prompt": "q"}""").score)
        assertNull(AiTurnParser.parse("""{"score": "seven", "next_prompt": "q"}""").score)
        assertNull(AiTurnParser.parse("""{"score": true, "next_prompt": "q"}""").score)
    }

    @Test
    fun citationAsObjectOrList() {
        assertEquals(
            "KTAS-2-EMERGENT",
            AiTurnParser.parse("""{"score": 5, "basis": {"id": "KTAS-2-EMERGENT", "text": "x"}, "next_prompt": "q"}""").basis
        )
        assertEquals(
            "ANAPH-EPI-IM",
            AiTurnParser.parse("""{"score": 5, "basis": [null, "ANAPH-EPI-IM", "WAO"], "next_prompt": "q"}""").basis
        )
    }

    @Test
    fun citationUnderAnotherKeyOrCasing() {
        assertEquals("SEPSIS-HOUR-ONE", AiTurnParser.parse("""{"score": 4, "criterion_id": "SEPSIS-HOUR-ONE", "nextPrompt": "q"}""").basis)
        assertEquals("q", AiTurnParser.parse("""{"Score": 4, "Citation": "X", "nextPrompt": "q"}""").nextPrompt)
    }

    @Test
    fun missingOrNullCitationLeavesTheRestAlone() {
        val missing = AiTurnParser.parse("""{"score": 9, "feedback": "Great.", "next_prompt": "q"}""")
        assertEquals(9, missing.score)
        assertNull(missing.basis)

        val explicitNull = AiTurnParser.parse("""{"score": 9, "basis": null, "next_prompt": "q"}""")
        assertEquals(9, explicitNull.score)
        assertNull(explicitNull.basis)

        assertNull(AiTurnParser.parse("""{"score": 9, "basis": "null", "next_prompt": "q"}""").basis)
        assertNull(AiTurnParser.parse("""{"score": 9, "basis": "", "next_prompt": "q"}""").basis)
    }

    @Test
    fun trailingCommaAndComments() {
        val turn = AiTurnParser.parse("{\n  // graded\n  \"score\": 3,\n  \"basis\": \"BURNS-COOLING\",\n  \"next_prompt\": \"q\",\n}")
        assertEquals(3, turn.score)
        assertEquals("BURNS-COOLING", turn.basis)
    }

    @Test
    fun bracesInsideStringsDontCutTheObjectShort() {
        val turn = AiTurnParser.parse(
            """{"score": 5, "feedback": "Think {airway} first }", "basis": "ABCDE-APPROACH", "next_prompt": "q"} and a stray } after"""
        )
        assertEquals(5, turn.score)
        assertEquals("Think {airway} first }", turn.feedback)
        assertEquals("ABCDE-APPROACH", turn.basis)
    }

    @Test
    fun skipsAnUnrelatedObjectBeforeTheTurn() {
        val turn = AiTurnParser.parse("""Vitals: {"hr": 120} -> {"score": 2, "next_prompt": "q"}""")
        assertEquals(2, turn.score)
        assertEquals("q", turn.nextPrompt)
    }

    @Test
    fun sessionCompleteAsString() {
        assertTrue(AiTurnParser.parse("""{"session_complete": "true", "next_prompt": "wrap"}""").sessionComplete)
        assertFalse(AiTurnParser.parse("""{"session_complete": "no", "next_prompt": "q"}""").sessionComplete)
    }

    @Test
    fun missingNextPromptIsEmptyNotTheRawJson() {
        val turn = AiTurnParser.parse("""{"score": 7, "feedback": "ok"}""")
        assertEquals(7, turn.score)
        assertEquals("", turn.nextPrompt)
    }

    @Test
    fun plainTextOrUnrelatedJsonBecomesTheQuestion() {
        assertEquals("What's the first thing you check?", AiTurnParser.parse("  What's the first thing you check?  ").nextPrompt)
        val unrelated = AiTurnParser.parse("""{"foo": 1}""")
        assertNull(unrelated.score)
        assertEquals("""{"foo": 1}""", unrelated.nextPrompt)
        assertEquals("{ not json", AiTurnParser.parse("{ not json").nextPrompt)
    }
}
