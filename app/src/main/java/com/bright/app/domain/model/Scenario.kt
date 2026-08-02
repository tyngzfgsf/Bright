package com.bright.app.domain.model

import com.bright.app.R

enum class ScenarioType(val stringRes: Int) {
    CARDIAC_ARREST(R.string.home_scenario_cardiac_arrest),
    ANAPHYLAXIS(R.string.home_scenario_anaphylaxis),
    STROKE(R.string.home_scenario_stroke),
    TRAUMA(R.string.home_scenario_trauma),
    CHOKING(R.string.home_scenario_choking),
    SEIZURE(R.string.home_scenario_seizure),
    DIABETIC(R.string.home_scenario_diabetic),
    ASTHMA(R.string.home_scenario_asthma),
    SEPSIS(R.string.home_scenario_sepsis),
    BURNS(R.string.home_scenario_burns);

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

enum class TraineeRole(val stringRes: Int, val promptLabel: String) {
    DOCTOR(R.string.home_role_doctor, "doctor"),
    NURSE(R.string.home_role_nurse, "nurse"),
    EMT(R.string.home_role_emt, "EMT/paramedic")
}

/** Who the AI plays. RANDOM is resolved to PATIENT or DOCTOR once, at session creation. */
enum class AiCharacterRole(val stringRes: Int, val promptLabel: String) {
    RANDOM(R.string.home_ai_role_random, ""),
    PATIENT(R.string.home_ai_role_patient, "the patient"),
    DOCTOR(R.string.home_ai_role_doctor, "a supervising doctor/examiner quizzing the trainee directly")
}

enum class Difficulty(val promptInstruction: String) {
    BEGINNER("Keep the case straightforward: classic, textbook presentation, minimal complications, and forgiving pacing."),
    INTERMEDIATE("Give the case some realistic ambiguity and one moderate complication partway through."),
    ADVANCED("Make the case demanding: atypical presentation, tight timing, and at least one significant complication or curveball.")
}
