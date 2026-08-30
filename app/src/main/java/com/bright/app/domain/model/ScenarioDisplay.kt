package com.bright.app.domain.model

import com.bright.app.R

/**
 * Android's half of the display-string mapping for the platform-neutral enums in `shared`
 * (see the comment atop shared/.../domain/model/Scenario.kt) — resource IDs only exist on
 * Android, so they live here rather than on the enums themselves. iOS will need its own
 * equivalent (a String Catalog lookup or similar) once Phase 5/6 gets there.
 */
val ScenarioType.stringRes: Int
    get() = when (this) {
        ScenarioType.CARDIAC_ARREST -> R.string.home_scenario_cardiac_arrest
        ScenarioType.ANAPHYLAXIS -> R.string.home_scenario_anaphylaxis
        ScenarioType.STROKE -> R.string.home_scenario_stroke
        ScenarioType.TRAUMA -> R.string.home_scenario_trauma
        ScenarioType.CHOKING -> R.string.home_scenario_choking
        ScenarioType.SEIZURE -> R.string.home_scenario_seizure
        ScenarioType.DIABETIC -> R.string.home_scenario_diabetic
        ScenarioType.ASTHMA -> R.string.home_scenario_asthma
        ScenarioType.SEPSIS -> R.string.home_scenario_sepsis
        ScenarioType.BURNS -> R.string.home_scenario_burns
    }

val TraineeRole.stringRes: Int
    get() = when (this) {
        TraineeRole.DOCTOR -> R.string.home_role_doctor
        TraineeRole.NURSE -> R.string.home_role_nurse
        TraineeRole.EMT -> R.string.home_role_emt
    }

val AiCharacterRole.stringRes: Int
    get() = when (this) {
        AiCharacterRole.RANDOM -> R.string.home_ai_role_random
        AiCharacterRole.PATIENT -> R.string.home_ai_role_patient
        AiCharacterRole.DOCTOR -> R.string.home_ai_role_doctor
    }
