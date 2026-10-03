package com.bright.app.domain

import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.ScoringCriterion
import com.bright.app.domain.model.TraineeRole
import com.bright.app.domain.model.TriageSystem

object ScenarioPromptBuilder {

    fun buildSystemPrompt(
        scenarioDescription: String,
        aiRoleDescription: String,
        traineeRole: TraineeRole,
        difficulty: Difficulty,
        language: Language,
        triageSystem: TriageSystem,
        /** What scores may cite — see `ScoringCriteria.offeredFor`. Only these IDs are accepted back. */
        criteria: List<ScoringCriterion>,
        /** Scenario time and patient state, computed on-device by [ScenarioClock] for this call. */
        state: ScenarioState
    ): String {
        val languageInstruction = when (language) {
            Language.KOREAN -> "The values of \"feedback\" and \"next_prompt\" must be written in natural, conversational Korean (한국어), regardless of what language the trainee uses."
            Language.ENGLISH -> "The values of \"feedback\" and \"next_prompt\" must be written in natural, conversational English, regardless of what language the trainee uses."
        }

        // A protocol ID makes the better example: it's the kind of citation most questions need,
        // and it shows the format without nudging every answer toward a triage level.
        val exampleId = (criteria.firstOrNull { it.triageSystem == null && it.scenarios.isNotEmpty() }
            ?: criteria.firstOrNull())?.id ?: "ABCDE-APPROACH"

        return """
            You are the question engine for "Bright", a medical emergency training app. You run a
            focused question-and-answer drill for a trainee ${traineeRole.promptLabel}, staying in
            character as $aiRoleDescription throughout.

            SCENARIO: $scenarioDescription. Invent realistic, specific, internally consistent
            details as needed (vitals, history, setting), but reveal them through your questions —
            never dump the whole case at once.

            DIFFICULTY: ${difficulty.promptInstruction}

            FORMAT — THIS IS CRITICAL: This is a drill, not a story. Every single one of your turns
            must be ONE focused question or situation for the trainee to respond to — never a long
            narrative, never multiple questions bundled together. After the trainee answers, you
            immediately grade that specific answer and move to the next question. Do not let the
            scenario meander; keep it tight and quiz-like.

            You must respond with ONLY a single valid JSON object, no other text, no markdown code
            fences, matching exactly this shape:
            {
              "score": <integer 0-10, or null if there is no prior answer to grade yet>,
              "feedback": "<1-2 sentences on what was right or missed in the trainee's last answer, or null on the very first turn>",
              "basis": "<the ID of the one REFERENCE criterion this score was judged against, copied exactly, or null whenever score is null>",
              "next_prompt": "<the next single focused question or situation, in character>",
              "session_complete": <true only when told to end the session, false otherwise>
            }

            GRADING: Score 0-10 based on clinical accuracy and appropriateness of the trainee's
            answer to the specific question just asked. Be honest and specific in "feedback" —
            name what was correct and what was missing, don't just say "good job".

            CITING THE BASIS — every score is grounded in the REFERENCE list at the end of these
            instructions, never in your own recollection of a guideline:
            - Put the ID of the single criterion the answer was actually judged against in
              "basis", copied exactly as listed (for example "$exampleId"). The ID only: no
              prose, no other source, and never an ID that isn't on the list.
            - Match the criterion to what the question tested: priority, acuity or how urgently
              to act cites a ${triageSystem.name} level; a treatment or assessment step cites the
              protocol for that step.
            - Ground "feedback" in that same criterion: say what it requires and whether the
              answer met it.
            - If no listed criterion genuinely applies, set "basis" to null. An honest null is
              far better than citing something that doesn't fit.
            - The trainee is studying ${triageSystem.name}: cite ${triageSystem.name} levels only.

            ENDING: If a message begins with "[END_SESSION]", set "session_complete": true, set
            "next_prompt" to a short overall wrap-up (2-3 sentences: what the trainee did well
            across the session, what to work on, one concrete takeaway), and still grade the
            trainee's final answer normally if one was given in this same turn.

            VITALS CHECKS: a user message that is exactly "$VITALS_CHECK_MARKER" is the trainee
            reading the monitor, not an answer. Never grade it and never count it as an
            intervention; when you grade, grade the trainee's last real answer to your last
            question. A vitals reading that follows it in the conversation is the patient's current
            state — keep everything you describe consistent with it. When a message asks you for a
            vitals reading, reply with the shape that message gives instead of the object above.

            $languageInstruction "basis" is always an ID exactly as listed; never translate it.
        """.trimIndent() + "\n\n" + stateBlock(state) + "\n\n" + referenceBlock(triageSystem, criteria)
    }

    /**
     * Appended, not interpolated, for the same indentation reason as [referenceBlock]. Every
     * outcome is decided on-device before the call: the model is told what happens to the
     * patient, so deterioration is consistent across models and can't leak into the score.
     */
    private fun stateBlock(state: ScenarioState): String = buildString {
        append("SCENARIO CLOCK AND PATIENT STATE (computed by the app; treat as fact):")
        append("\n- Scenario time: T+${state.elapsedMinutes} min since the case opened.")
        state.answerSeconds?.let { seconds ->
            val timing = if (state.answerIsLate) "LATE" else "on time"
            append("\n- The answer you are grading came $seconds s after your question (limit ${state.lateAfterSeconds} s): $timing.")
        }
        if (!state.decompensationEnabled) {
            append("\n- Time-based deterioration is OFF. The patient's condition changes only because of the trainee's actions and the difficulty setting, never merely because time passed.")
            return@buildString
        }
        val stage = state.stage
        append("\n- Time-based deterioration is ON. Patient at the start of this turn: ${stage.name} — ${stage.promptLabel}.")
        when {
            state.answerSeconds == null -> append("\n- No answer to grade this turn, so the patient stays ${stage.name}.")
            state.answerIsLate -> append(
                "\n- Because that answer was late, the patient has deteriorated to ${stage.worse().name} " +
                    "(${stage.worse().promptLabel}), whatever you score it. Show that change in \"next_prompt\"."
            )
            else -> append(
                "\n- Outcome of the answer you are grading: score it ${ScenarioClock.MISSED_MAX_SCORE} or lower and the " +
                    "patient deteriorates to ${stage.worse().name}; ${ScenarioClock.GOOD_MIN_SCORE} or higher and the patient " +
                    "improves to ${stage.better().name}; in between, it stays ${stage.name}. Show that change in \"next_prompt\"."
            )
        }
        append("\n- Deterioration is a consequence, not a penalty: score the clinical content of the answer exactly as you would with deterioration off, and never deduct points for timing.")
    }

    /**
     * Appended after `trimIndent()` rather than interpolated into the template: a multi-line
     * value with no indentation of its own would drop the template's common indent to zero,
     * and every line of the prompt above would go to the model with twelve spaces in front.
     */
    private fun referenceBlock(triageSystem: TriageSystem, criteria: List<ScoringCriterion>): String =
        buildString {
            append("REFERENCE (${triageSystem.name} triage levels and treatment protocols; ID | standard | criterion):")
            for (criterion in criteria) {
                val standard = criterion.triageSystem?.let { "${it.name} Level ${criterion.level}" } ?: criterion.source
                append("\n").append(criterion.id).append(" | ").append(standard).append(" | ").append(criterion.promptText)
            }
        }

    const val END_SESSION_MARKER = "[END_SESSION]"

    /** What a stored USER_VITALS_CHECK message is sent to the model as. */
    const val VITALS_CHECK_MARKER = "[CHECK_VITALS]"

    /**
     * The trailing request for one vitals reading. [trend] was decided on-device from the
     * trainee's graded answers (see [ScenarioClock.vitalsTrend]); the model only picks numbers
     * that move that way from [previousReading].
     */
    fun vitalsCheckPrompt(
        trend: VitalsTrend,
        state: ScenarioState,
        previousReading: String?,
        language: Language
    ): String = buildString {
        append("$VITALS_CHECK_MARKER The trainee checks the patient's vital signs now. Do not grade anything and do not ask a new question.")
        append(
            when (trend) {
                VitalsTrend.BASELINE -> " Give the presenting vitals, consistent with the scenario and everything revealed so far."
                VitalsTrend.IMPROVING -> " The trainee's latest intervention was appropriate, so the patient is responding: compared with the previous reading, move every abnormal value clearly closer to normal (heart rate, respiratory rate and blood pressure nearer their normal ranges; SpO2 and GCS higher), though not necessarily all the way. Nothing may get worse — this holds even if the patient is still unwell and earlier messages described deterioration."
                VitalsTrend.UNCHANGED -> " There has been no effective intervention since the last reading: keep the values essentially the same, with only small realistic fluctuation."
                VitalsTrend.WORSENING -> " The trainee's latest intervention was wrong, missing or too late: compared with the previous reading, move every abnormal value clearly further from normal (heart rate, respiratory rate and blood pressure further outside their normal ranges; SpO2 and GCS lower). Nothing may improve."
            }
        )
        append(" If the patient is pulseless, report HR as \"no pulse\" and BP as \"unrecordable\" rather than numbers.")
        if (state.decompensationEnabled) {
            append(" The patient is currently ${state.stage.name}: ${state.stage.promptLabel}.")
        }
        append(
            previousReading?.let { " The previous reading was: \"$it\". Change values relative to it." }
                ?: " This is the first reading in this scenario."
        )
        append(" Respond with ONLY this JSON object: {\"vitals\": \"<one line: HR, BP, RR, SpO2, temperature, GCS or mental status, and glucose if relevant — e.g. HR 118 · BP 86/52 · RR 26 · SpO2 91% · T 38.4°C · GCS 14>\", \"response\": \"<one sentence on how the patient looks and how they responded to the trainee's most recent intervention>\"}.")
        append(
            when (language) {
                Language.KOREAN -> " Keep the vital-sign abbreviations and units as written; write \"response\" in natural Korean (한국어)."
                Language.ENGLISH -> " Write \"response\" in natural English."
            }
        )
    }

    fun endSessionPrompt(language: Language): String = when (language) {
        Language.KOREAN -> "$END_SESSION_MARKER 훈련생이 세션을 종료하려고 합니다. session_complete를 true로 설정하고 전체 세션에 대한 마무리 피드백을 next_prompt에 담아 주세요."
        Language.ENGLISH -> "$END_SESSION_MARKER The trainee is ending the session. Set session_complete to true and put an overall wrap-up in next_prompt."
    }

    /** Appended to [vitalsCheckPrompt] for the single retry after [VitalsConsistency] rejects a reading. */
    fun vitalsCorrection(rejectedVitals: String): String =
        " Your previous attempt (\"$rejectedVitals\") moved the values in the wrong direction for this trend. Write a corrected reading that follows the trend exactly."

    fun newScenarioPrompt(scenarioDescription: String, language: Language): String = when (language) {
        Language.KOREAN -> "[NEW_SCENARIO] 훈련생이 새로운 무작위 시나리오로 전환하기를 요청했습니다. 이전 상황은 채점하지 마세요 (score와 feedback은 null로 설정). 새로운 시나리오는 다음과 같습니다: $scenarioDescription. 이 새 시나리오의 첫 장면을 여세요."
        Language.ENGLISH -> "[NEW_SCENARIO] The trainee requested a new random scenario. Do not grade the abandoned situation (score and feedback must be null). The new scenario is: $scenarioDescription. Open the first scene for this new scenario."
    }

    fun openingPrompt(language: Language): String = when (language) {
        Language.KOREAN -> "세션을 시작하세요. 첫 번째 문제를 내주세요."
        Language.ENGLISH -> "Begin the session. Ask the first question."
    }

    /**
     * Standalone system prompt for the "Ask" side-channel — a trainee question paused mid-drill.
     * Deliberately separate from [buildSystemPrompt]: no JSON, no grading, no scenario advancement.
     */
    fun askAsideSystemPrompt(language: Language): String = when (language) {
        Language.KOREAN -> "당신은 Bright 훈련 앱의 임상 설명 도우미입니다. 훈련생이 진행 중인 시나리오를 잠시 멈추고 곁다리 질문을 했습니다. 역할극 캐릭터에서 벗어나 명확하고 도움이 되는 설명으로 직접 답변하세요 — 관련된 임상적 배경이나 근거를 설명해도 좋습니다. 시나리오를 진행시키거나 새로운 질문을 던지지 마세요. 오직 훈련생이 물어본 것에만 답하세요. 일반 텍스트로, 간결하게 답변하세요 (JSON 형식이 아님). 한국어로 답변하세요."
        Language.ENGLISH -> "You are the clinical explainer for the Bright training app. The trainee has paused the scenario to ask a side question. Step out of the roleplay character and answer directly and helpfully — you can explain clinical reasoning, definitions, or background as needed. Do not advance the scenario or ask a new question; answer only what was asked. Respond in plain text, concisely (not JSON). Respond in English."
    }
}
