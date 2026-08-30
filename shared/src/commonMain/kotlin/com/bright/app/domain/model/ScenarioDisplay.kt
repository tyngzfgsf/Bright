package com.bright.app.domain.model

import com.bright.app.resources.Res
import com.bright.app.resources.home_ai_role_doctor
import com.bright.app.resources.home_ai_role_patient
import com.bright.app.resources.home_ai_role_random
import com.bright.app.resources.home_role_doctor
import com.bright.app.resources.home_role_emt
import com.bright.app.resources.home_role_nurse
import com.bright.app.resources.home_scenario_anaphylaxis
import com.bright.app.resources.home_scenario_asthma
import com.bright.app.resources.home_scenario_burns
import com.bright.app.resources.home_scenario_cardiac_arrest
import com.bright.app.resources.home_scenario_choking
import com.bright.app.resources.home_scenario_diabetic
import com.bright.app.resources.home_scenario_seizure
import com.bright.app.resources.home_scenario_sepsis
import com.bright.app.resources.home_scenario_stroke
import com.bright.app.resources.home_scenario_trauma
import org.jetbrains.compose.resources.StringResource

/**
 * Display-string mapping for the platform-neutral enums in `Scenario.kt`.
 *
 * This used to live in the Android app module and return an `Int` resource ID, because
 * `R.string` doesn't exist outside Android (see Phase 2 in IOS_MIGRATION_PLAN.md). Now that
 * the strings are Compose Resources rather than Android resources, the mapping is itself
 * multiplatform and lives here — that workaround is gone.
 *
 * It stays an extension rather than a property on the enums so the domain types remain free of
 * any UI/resource dependency.
 */
val ScenarioType.stringRes: StringResource
    get() = when (this) {
        ScenarioType.CARDIAC_ARREST -> Res.string.home_scenario_cardiac_arrest
        ScenarioType.ANAPHYLAXIS -> Res.string.home_scenario_anaphylaxis
        ScenarioType.STROKE -> Res.string.home_scenario_stroke
        ScenarioType.TRAUMA -> Res.string.home_scenario_trauma
        ScenarioType.CHOKING -> Res.string.home_scenario_choking
        ScenarioType.SEIZURE -> Res.string.home_scenario_seizure
        ScenarioType.DIABETIC -> Res.string.home_scenario_diabetic
        ScenarioType.ASTHMA -> Res.string.home_scenario_asthma
        ScenarioType.SEPSIS -> Res.string.home_scenario_sepsis
        ScenarioType.BURNS -> Res.string.home_scenario_burns
    }

val TraineeRole.stringRes: StringResource
    get() = when (this) {
        TraineeRole.DOCTOR -> Res.string.home_role_doctor
        TraineeRole.NURSE -> Res.string.home_role_nurse
        TraineeRole.EMT -> Res.string.home_role_emt
    }

val AiCharacterRole.stringRes: StringResource
    get() = when (this) {
        AiCharacterRole.RANDOM -> Res.string.home_ai_role_random
        AiCharacterRole.PATIENT -> Res.string.home_ai_role_patient
        AiCharacterRole.DOCTOR -> Res.string.home_ai_role_doctor
    }
