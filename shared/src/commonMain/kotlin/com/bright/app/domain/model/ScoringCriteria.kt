package com.bright.app.domain.model

/**
 * What a score is allowed to cite.
 *
 * The point of a citation is that the trainee can check a grade against something that isn't
 * the model — so the model never writes the criterion itself. It's shown this list, answers
 * with an ID, and the app renders its *own* text for that ID (see `ScoringCriteriaDisplay.kt`).
 * An ID that isn't on the list the session offered is dropped rather than shown: a made-up
 * citation is the exact failure this exists to prevent — the most common complaint about
 * studying clinical material with a general chatbot is that it's confidently wrong, invented
 * references included.
 *
 * **Paraphrased, not clinically reviewed.** Same standing as TriageLevels.kt: each line is a
 * short paraphrase of a published triage definition or guideline recommendation, written
 * conservatively (ranges rather than single numbers where guidelines differ), and it needs an
 * audit by someone with emergency-medicine experience before the app claims more than that.
 *
 * IDs are what gets stored with a scored answer. Reword the text freely, but never reuse an ID
 * for a different criterion — old answers would quietly start citing the new text.
 */
data class ScoringCriterion(
    val id: String,
    /** Set for triage-level criteria; null for treatment protocols. */
    val triageSystem: TriageSystem? = null,
    val level: Int? = null,
    /** Guideline family for a protocol criterion. Proper nouns, shown untranslated. */
    val source: String? = null,
    /** Preset scenarios a protocol applies to; empty means every scenario. */
    val scenarios: Set<ScenarioType> = emptySet(),
    /** English, for the model only. What the trainee reads comes from string resources. */
    val promptText: String
)

object ScoringCriteria {

    /**
     * Stored on a graded answer whose score cited nothing usable. Distinct from null, which
     * means the answer was graded before citations existed — those shouldn't be flagged as
     * uncited after the fact.
     */
    const val UNCITED = "UNCITED"

    private fun esi(id: String, level: Int, text: String) =
        ScoringCriterion(id = id, triageSystem = TriageSystem.ESI, level = level, promptText = text)

    private fun ktas(id: String, level: Int, text: String) =
        ScoringCriterion(id = id, triageSystem = TriageSystem.KTAS, level = level, promptText = text)

    private fun protocol(id: String, source: String, vararg scenarios: ScenarioType, text: String) =
        ScoringCriterion(id = id, source = source, scenarios = scenarios.toSet(), promptText = text)

    val all: List<ScoringCriterion> = listOf(
        esi("ESI-1-LIFESAVING", 1, "Needs an immediate life-saving intervention: airway or breathing support, emergency medication, or hemodynamic intervention (e.g. pulseless, apneic, unresponsive)."),
        esi("ESI-2-HIGH-RISK", 2, "High-risk situation, new confusion, lethargy or disorientation, or severe pain or distress: should not wait."),
        esi("ESI-2-DANGER-VITALS", 2, "Danger-zone vital signs in an adult (HR over 100, RR over 20, or SpO2 under 92%): consider up-triaging to Level 2."),
        esi("ESI-3-RESOURCES", 3, "Stable, but expected to need two or more resources (e.g. labs plus imaging, IV fluids)."),
        esi("ESI-4-ONE-RESOURCE", 4, "Stable, expected to need one resource."),
        esi("ESI-5-NO-RESOURCES", 5, "Stable, expected to need no resources beyond examination."),

        ktas("KTAS-1-RESUSCITATION", 1, "Resuscitation: arrest or imminent arrest needing immediate intervention (e.g. cardiac or respiratory arrest, unresponsiveness, severe shock, severe respiratory distress)."),
        ktas("KTAS-2-EMERGENT", 2, "Emergent: potential threat to life, limb or function needing rapid intervention (e.g. altered mental status, moderate respiratory distress, hemodynamic compromise, severe pain)."),
        ktas("KTAS-3-URGENT", 3, "Urgent: could progress to a serious problem needing emergency intervention (e.g. mild respiratory distress, moderate pain)."),
        ktas("KTAS-4-LESS-URGENT", 4, "Less urgent: related to age, distress or potential to deteriorate; benefits from treatment within 1-2 hours."),
        ktas("KTAS-5-NON-URGENT", 5, "Non-urgent: acute but non-urgent, or part of a chronic problem; can be delayed or referred."),

        protocol("ABCDE-APPROACH", "Resus Council UK", text = "Assess and treat in order: airway, breathing, circulation, disability, exposure; fix each problem before moving on and reassess after any change."),

        protocol("CPR-QUALITY", "AHA BLS", ScenarioType.CARDIAC_ARREST, ScenarioType.CHOKING, text = "High-quality CPR: compressions 100-120/min, at least 5 cm (2 in) deep in adults, full recoil, interruptions under 10 seconds; check pulse for no more than 10 seconds."),
        protocol("CPR-RATIO", "AHA BLS", ScenarioType.CARDIAC_ARREST, ScenarioType.CHOKING, text = "Without an advanced airway: 30 compressions to 2 breaths."),
        protocol("CPR-DEFIB", "AHA ACLS", ScenarioType.CARDIAC_ARREST, text = "Shockable rhythm (VF or pulseless VT): defibrillate as soon as possible, then resume CPR immediately."),
        protocol("CPR-EPINEPHRINE", "AHA ACLS", ScenarioType.CARDIAC_ARREST, text = "Epinephrine 1 mg IV/IO every 3-5 minutes during cardiac arrest."),

        protocol("ANAPH-EPI-IM", "WAO", ScenarioType.ANAPHYLAXIS, text = "IM epinephrine 0.01 mg/kg of 1 mg/mL (max 0.5 mg in adults) into the anterolateral thigh; repeat after 5-15 minutes if needed."),
        protocol("ANAPH-EPI-FIRST", "WAO", ScenarioType.ANAPHYLAXIS, text = "Epinephrine is first-line; antihistamines and corticosteroids do not replace it and must not delay it."),
        protocol("ANAPH-POSITION", "WAO", ScenarioType.ANAPHYLAXIS, text = "Lie the patient flat with legs raised (sitting up if breathing is difficult); avoid sudden standing or sitting."),

        protocol("STROKE-RECOGNITION", "AHA/ASA", ScenarioType.STROKE, text = "Recognise stroke with BE-FAST and establish the last-known-well time."),
        protocol("STROKE-THROMBOLYSIS", "AHA/ASA", ScenarioType.STROKE, text = "Check blood glucose and get brain imaging to exclude hemorrhage before IV thrombolysis, which eligible patients can receive within 4.5 hours of last known well."),

        protocol("TRAUMA-HEMORRHAGE", "Stop the Bleed", ScenarioType.TRAUMA, text = "Direct pressure first; for life-threatening limb bleeding pressure can't control, a tourniquet 5-8 cm (2-3 in) above the wound, not over a joint, with the time recorded."),
        protocol("TRAUMA-PRIMARY-SURVEY", "ATLS", ScenarioType.TRAUMA, ScenarioType.BURNS, text = "Primary survey: control catastrophic external bleeding, then airway with cervical-spine protection, breathing, circulation, disability, exposure."),

        protocol("CHOKING-ADULT", "AHA/ERC", ScenarioType.CHOKING, text = "Encourage coughing while it's effective; if the cough becomes ineffective, back blows and/or abdominal thrusts until the object clears."),
        protocol("CHOKING-INFANT", "AHA/ERC", ScenarioType.CHOKING, text = "Infants under 1 year: 5 back blows then 5 chest thrusts; never abdominal thrusts."),
        protocol("CHOKING-UNRESPONSIVE", "AHA/ERC", ScenarioType.CHOKING, text = "If the person becomes unresponsive, start CPR; look in the mouth before breaths and remove only a visible object."),

        protocol("SEIZURE-FIRST-AID", "Seizure first aid", ScenarioType.SEIZURE, text = "Protect from injury, don't restrain or put anything in the mouth, time the seizure, recovery position once it stops; check blood glucose."),
        protocol("SEIZURE-STATUS", "AES", ScenarioType.SEIZURE, text = "A seizure lasting 5 minutes or more is status epilepticus: first-line benzodiazepine (IM midazolam, IV lorazepam or IV diazepam)."),

        protocol("DIABETIC-HYPO", "ADA", ScenarioType.DIABETIC, text = "Hypoglycemia (under 70 mg/dL / 3.9 mmol/L): if able to swallow, 15-20 g fast-acting glucose and recheck in 15 minutes; if not, glucagon or IV dextrose."),
        protocol("DIABETIC-DKA", "ADA", ScenarioType.DIABETIC, text = "DKA: IV fluids first, then insulin; check potassium before insulin and hold insulin if K is under 3.3 mmol/L."),

        protocol("ASTHMA-SABA-OXYGEN", "GINA", ScenarioType.ASTHMA, text = "Repeated inhaled short-acting beta2-agonist (e.g. salbutamol); controlled oxygen to SpO2 93-95% in adults."),
        protocol("ASTHMA-ESCALATION", "GINA", ScenarioType.ASTHMA, text = "Systemic corticosteroids early; add ipratropium for severe attacks; consider IV magnesium sulfate if not responding."),
        protocol("ASTHMA-DANGER-SIGNS", "GINA", ScenarioType.ASTHMA, text = "Drowsiness, confusion or a silent chest are life-threatening signs: escalate to critical care urgently."),

        protocol("SEPSIS-HOUR-ONE", "Surviving Sepsis Campaign", ScenarioType.SEPSIS, text = "Within the first hour: measure lactate, take blood cultures before antibiotics, give broad-spectrum antibiotics."),
        protocol("SEPSIS-FLUIDS-PRESSORS", "Surviving Sepsis Campaign", ScenarioType.SEPSIS, text = "For hypotension or lactate of 4 mmol/L or more, 30 mL/kg IV crystalloid early; vasopressors (norepinephrine first-line) to a MAP of 65 mmHg or more."),

        protocol("BURNS-COOLING", "ISBI", ScenarioType.BURNS, text = "Cool the burn under cool running water for 20 minutes (worthwhile up to 3 hours after injury); no ice; remove jewellery and clothing that isn't stuck."),
        protocol("BURNS-FLUIDS", "ATLS", ScenarioType.BURNS, text = "Estimate %TBSA (rule of nines; the patient's palm is about 1%); large burns need formula-guided IV fluids, 2-4 mL x kg x %TBSA over 24 hours with half in the first 8, titrated to urine output."),
        protocol("BURNS-AIRWAY", "ATLS", ScenarioType.BURNS, text = "Signs of inhalation injury (facial burns, singed nasal hair, soot, hoarseness, stridor): assess the airway early and consider early intubation.")
    )

    private val byIdMap: Map<String, ScoringCriterion> = all.associateBy { it.id }

    fun byId(id: String?): ScoringCriterion? = id?.let { byIdMap[it] }

    /**
     * What one session's prompt offers: the active triage system's levels plus the protocols
     * for its scenario. A custom scenario (no preset type) gets every protocol, because there's
     * no way to know in advance which apply.
     */
    fun offeredFor(system: TriageSystem, scenario: ScenarioType?): List<ScoringCriterion> =
        all.filter { criterion ->
            when {
                criterion.triageSystem != null -> criterion.triageSystem == system
                scenario == null -> true
                else -> criterion.scenarios.isEmpty() || scenario in criterion.scenarios
            }
        }

    /**
     * Matches what the model wrote against [offered], forgivingly about *form* and strictly
     * about *substance*: case, underscores, spaces, wrapping quotes or brackets, and trailing
     * text after the ID ("ESI-2-HIGH-RISK: high-risk situation") are all fine; a bare prefix is
     * accepted only when it points at exactly one offered criterion ("KTAS-2" yes, "ESI-2" no).
     * Anything else — an ID from another triage system, another scenario's protocol, or one
     * that doesn't exist — resolves to null.
     */
    fun resolve(raw: String?, offered: List<ScoringCriterion>): ScoringCriterion? {
        val candidate = normalize(raw ?: return null)
        if (candidate.isEmpty()) return null

        offered
            .filter { candidate == it.id || candidate.startsWith(it.id) && !candidate[it.id.length].isLetterOrDigit() }
            .maxByOrNull { it.id.length }
            ?.let { return it }

        return offered.filter { it.id.startsWith("$candidate-") }.singleOrNull()
    }

    internal fun normalize(raw: String): String =
        raw.trim()
            .trim('"', '\'', '`', '*', '[', ']', '(', ')', '<', '>')
            .trim()
            .uppercase()
            .replace(Regex("[_\\s]+"), "-")
}
