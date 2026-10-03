package com.bright.app.domain.model

import com.bright.app.resources.Res
import com.bright.app.resources.*
import org.jetbrains.compose.resources.StringResource

/**
 * What the trainee reads for each [ScoringCriterion] — the same split as `ScenarioDisplay.kt`:
 * the domain table carries the English the model is shown, the display text is a string
 * resource. Generated from `ScoringCriteria.all`; keep one entry per ID.
 *
 * Null only for an ID with no string, which `ScoringCriteriaDisplayTest` doesn't allow — callers
 * fall back to the English prompt text rather than showing nothing.
 */
val ScoringCriterion.textRes: StringResource?
    get() = when (id) {
        "ESI-1-LIFESAVING" -> Res.string.criterion_esi_1_lifesaving
        "ESI-2-HIGH-RISK" -> Res.string.criterion_esi_2_high_risk
        "ESI-2-DANGER-VITALS" -> Res.string.criterion_esi_2_danger_vitals
        "ESI-3-RESOURCES" -> Res.string.criterion_esi_3_resources
        "ESI-4-ONE-RESOURCE" -> Res.string.criterion_esi_4_one_resource
        "ESI-5-NO-RESOURCES" -> Res.string.criterion_esi_5_no_resources
        "KTAS-1-RESUSCITATION" -> Res.string.criterion_ktas_1_resuscitation
        "KTAS-2-EMERGENT" -> Res.string.criterion_ktas_2_emergent
        "KTAS-3-URGENT" -> Res.string.criterion_ktas_3_urgent
        "KTAS-4-LESS-URGENT" -> Res.string.criterion_ktas_4_less_urgent
        "KTAS-5-NON-URGENT" -> Res.string.criterion_ktas_5_non_urgent
        "ABCDE-APPROACH" -> Res.string.criterion_abcde_approach
        "CPR-QUALITY" -> Res.string.criterion_cpr_quality
        "CPR-RATIO" -> Res.string.criterion_cpr_ratio
        "CPR-DEFIB" -> Res.string.criterion_cpr_defib
        "CPR-EPINEPHRINE" -> Res.string.criterion_cpr_epinephrine
        "ANAPH-EPI-IM" -> Res.string.criterion_anaph_epi_im
        "ANAPH-EPI-FIRST" -> Res.string.criterion_anaph_epi_first
        "ANAPH-POSITION" -> Res.string.criterion_anaph_position
        "STROKE-RECOGNITION" -> Res.string.criterion_stroke_recognition
        "STROKE-THROMBOLYSIS" -> Res.string.criterion_stroke_thrombolysis
        "TRAUMA-HEMORRHAGE" -> Res.string.criterion_trauma_hemorrhage
        "TRAUMA-PRIMARY-SURVEY" -> Res.string.criterion_trauma_primary_survey
        "CHOKING-ADULT" -> Res.string.criterion_choking_adult
        "CHOKING-INFANT" -> Res.string.criterion_choking_infant
        "CHOKING-UNRESPONSIVE" -> Res.string.criterion_choking_unresponsive
        "SEIZURE-FIRST-AID" -> Res.string.criterion_seizure_first_aid
        "SEIZURE-STATUS" -> Res.string.criterion_seizure_status
        "DIABETIC-HYPO" -> Res.string.criterion_diabetic_hypo
        "DIABETIC-DKA" -> Res.string.criterion_diabetic_dka
        "ASTHMA-SABA-OXYGEN" -> Res.string.criterion_asthma_saba_oxygen
        "ASTHMA-ESCALATION" -> Res.string.criterion_asthma_escalation
        "ASTHMA-DANGER-SIGNS" -> Res.string.criterion_asthma_danger_signs
        "SEPSIS-HOUR-ONE" -> Res.string.criterion_sepsis_hour_one
        "SEPSIS-FLUIDS-PRESSORS" -> Res.string.criterion_sepsis_fluids_pressors
        "BURNS-COOLING" -> Res.string.criterion_burns_cooling
        "BURNS-FLUIDS" -> Res.string.criterion_burns_fluids
        "BURNS-AIRWAY" -> Res.string.criterion_burns_airway
        else -> null
    }
