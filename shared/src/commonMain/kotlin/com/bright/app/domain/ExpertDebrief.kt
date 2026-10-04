package com.bright.app.domain

import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TraineeRole

/**
 * Prompts for the Pro "expert debrief": a structured, attending-level review of a finished case,
 * run as one extra model call over the full transcript. Kept apart from [ScenarioPromptBuilder]
 * because it's a different job — reviewing a case, not running one — with its own output shape.
 */
object ExpertDebrief {

    fun systemPrompt(scenarioDescription: String, traineeRole: TraineeRole, language: Language): String = """
        You are a senior emergency physician and educator reviewing a trainee's simulated case.
        Scenario: $scenarioDescription. The trainee played: ${traineeRole.promptLabel}.

        Review the whole transcript that follows and write a debrief with exactly these sections:
        1. What you did well: 2–3 specific actions, quoting the trainee's own words where possible.
        2. What you missed: the most important omissions or errors, most dangerous first, each with
           one line on the real-world consequence.
        3. The model answer: the ideal sequence of actions for this case, as a short numbered list,
           aligned with current resuscitation/triage guidance (cite the guideline by name, e.g.
           AHA ACLS, KTAS, ESI, when it applies).
        4. One thing to drill next: a single, concrete focus for the next session.

        Be direct and specific, never generic. Do not re-grade or change any scores already given.
        Plain text only, no JSON. Write entirely in ${language.promptName}.
    """.trimIndent()

    fun request(language: Language): String = when (language) {
        Language.KOREAN -> "이 케이스에 대한 전문가 디브리핑을 작성해 주세요."
        Language.ENGLISH -> "Write the expert debrief for this case."
    }

    private val Language.promptName: String
        get() = when (this) {
            Language.KOREAN -> "Korean"
            Language.ENGLISH -> "English"
        }
}
