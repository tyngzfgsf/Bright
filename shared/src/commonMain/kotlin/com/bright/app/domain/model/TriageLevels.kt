package com.bright.app.domain.model

/**
 * First-pass, best-effort triage-level assignments for each [ScenarioType] under each
 * [TriageSystem]. **Not clinically reviewed** — these exist so the app can group and label
 * scenarios by acuity as a rough training aid, not as an authoritative clinical reference.
 * Someone with real emergency-medicine triage experience should audit this table before it's
 * presented as anything more than that.
 *
 * KTAS and ESI genuinely diverge on several rows here (stroke, sepsis, burns), reflecting how
 * differently the two scales weigh protocol-driven activations — e.g. KTAS commonly escalates a
 * sepsis-alert or stroke-window case straight to Level 1, where ESI's stricter "requires an
 * immediate life-saving intervention" bar for Level 1 often lands the same case at 2. Copying
 * one system's level onto the other would misrepresent both, which is exactly why this is two
 * separate tables rather than one.
 */
fun ScenarioType.triageLevel(system: TriageSystem): Int = when (system) {
    TriageSystem.KTAS -> ktasLevel
    TriageSystem.ESI -> esiLevel
}

private val ScenarioType.ktasLevel: Int
    get() = when (this) {
        ScenarioType.CARDIAC_ARREST -> 1
        ScenarioType.ANAPHYLAXIS -> 1
        ScenarioType.STROKE -> 1
        ScenarioType.TRAUMA -> 2
        ScenarioType.CHOKING -> 1
        ScenarioType.SEIZURE -> 2
        ScenarioType.DIABETIC -> 2
        ScenarioType.ASTHMA -> 2
        ScenarioType.SEPSIS -> 1
        ScenarioType.BURNS -> 2
    }

private val ScenarioType.esiLevel: Int
    get() = when (this) {
        ScenarioType.CARDIAC_ARREST -> 1
        ScenarioType.ANAPHYLAXIS -> 1
        ScenarioType.STROKE -> 2
        ScenarioType.TRAUMA -> 2
        ScenarioType.CHOKING -> 1
        ScenarioType.SEIZURE -> 2
        ScenarioType.DIABETIC -> 2
        ScenarioType.ASTHMA -> 2
        ScenarioType.SEPSIS -> 2
        ScenarioType.BURNS -> 3
    }
