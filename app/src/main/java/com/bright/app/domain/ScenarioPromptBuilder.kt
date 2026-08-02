package com.bright.app.domain

import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TraineeRole

object ScenarioPromptBuilder {

    fun buildSystemPrompt(
        scenarioDescription: String,
        aiRoleDescription: String,
        traineeRole: TraineeRole,
        difficulty: Difficulty,
        language: Language
    ): String {
        val languageInstruction = when (language) {
            Language.KOREAN -> "The values of \"feedback\" and \"next_prompt\" must be written in natural, conversational Korean (한국어), regardless of what language the trainee uses."
            Language.ENGLISH -> "The values of \"feedback\" and \"next_prompt\" must be written in natural, conversational English, regardless of what language the trainee uses."
        }

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
              "next_prompt": "<the next single focused question or situation, in character>",
              "session_complete": <true only when told to end the session, false otherwise>
            }

            GRADING: Score 0-10 based on clinical accuracy and appropriateness of the trainee's
            answer to the specific question just asked. Be honest and specific in "feedback" —
            name what was correct and what was missing, don't just say "good job".

            ENDING: If a message begins with "[END_SESSION]", set "session_complete": true, set
            "next_prompt" to a short overall wrap-up (2-3 sentences: what the trainee did well
            across the session, what to work on, one concrete takeaway), and still grade the
            trainee's final answer normally if one was given in this same turn.

            $languageInstruction
        """.trimIndent()
    }

    const val END_SESSION_MARKER = "[END_SESSION]"

    fun endSessionPrompt(language: Language): String = when (language) {
        Language.KOREAN -> "$END_SESSION_MARKER 훈련생이 세션을 종료하려고 합니다. session_complete를 true로 설정하고 전체 세션에 대한 마무리 피드백을 next_prompt에 담아 주세요."
        Language.ENGLISH -> "$END_SESSION_MARKER The trainee is ending the session. Set session_complete to true and put an overall wrap-up in next_prompt."
    }

    /** Hidden instruction sent when the trainee shuffles to a new random scenario mid-session. */
    fun newScenarioPrompt(scenarioDescription: String, language: Language): String = when (language) {
        Language.KOREAN -> "[NEW_SCENARIO] 훈련생이 새로운 무작위 시나리오로 전환하기를 요청했습니다. 이전 상황은 채점하지 마세요 (score와 feedback은 null로 설정). 새로운 시나리오는 다음과 같습니다: $scenarioDescription. 이 새 시나리오의 첫 장면을 여세요."
        Language.ENGLISH -> "[NEW_SCENARIO] The trainee requested a new random scenario. Do not grade the abandoned situation (score and feedback must be null). The new scenario is: $scenarioDescription. Open the first scene for this new scenario."
    }

    fun openingPrompt(language: Language): String = when (language) {
        Language.KOREAN -> "세션을 시작하세요. 첫 번째 문제를 내주세요."
        Language.ENGLISH -> "Begin the session. Ask the first question."
    }
}
