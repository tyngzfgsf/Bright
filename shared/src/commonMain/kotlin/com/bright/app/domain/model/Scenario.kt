package com.bright.app.domain.model

/**
 * Display strings for these enums are NOT here — they used to be a `stringRes: Int` pointing
 * at Android's generated `R.string.*`, which doesn't exist in commonMain or on iOS. Each
 * platform now supplies its own display-string mapping as an extension (see
 * `ScenarioDisplay.kt` in the Android app module for the Android side); this file only carries
 * what's actually platform-neutral about a scenario/role.
 */
enum class ScenarioType {
    CARDIAC_ARREST,
    ANAPHYLAXIS,
    STROKE,
    TRAUMA,
    CHOKING,
    SEIZURE,
    DIABETIC,
    ASTHMA,
    SEPSIS,
    BURNS;

    /** Short English keyword injected into the AI system prompt — kept language-neutral for the model. */
    val promptKeyword: String
        get() = when (this) {
            CARDIAC_ARREST -> "cardiac arrest"
            ANAPHYLAXIS -> "anaphylactic shock"
            STROKE -> "acute stroke"
            TRAUMA -> "traumatic bleeding injury"
            CHOKING -> "airway obstruction / choking"
            SEIZURE -> "active seizure"
            DIABETIC -> "diabetic emergency (hypo/hyperglycemia)"
            ASTHMA -> "acute asthma attack"
            SEPSIS -> "sepsis"
            BURNS -> "burn injury"
        }
}

enum class TraineeRole(val promptLabel: String) {
    DOCTOR("doctor"),
    NURSE("nurse"),
    EMT("EMT/paramedic")
}

/** Who the AI plays. RANDOM is resolved to PATIENT or DOCTOR once, at session creation. */
enum class AiCharacterRole(val promptLabel: String) {
    RANDOM(""),
    PATIENT("the patient"),
    DOCTOR("a supervising doctor/examiner quizzing the trainee directly")
}

enum class Difficulty(val promptInstruction: String) {
    BEGINNER("Keep the case straightforward: classic, textbook presentation, minimal complications, and forgiving pacing."),
    INTERMEDIATE("Give the case some realistic ambiguity and one moderate complication partway through."),
    ADVANCED("Make the case demanding: atypical presentation, tight timing, and at least one significant complication or curveball.")
}
