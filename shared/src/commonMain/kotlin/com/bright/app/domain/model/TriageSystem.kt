package com.bright.app.domain.model

/**
 * A regional triage/acuity scale, 1 (most urgent) to 5 (least urgent). KTAS and ESI are both
 * 1-5 scales but use different assessment criteria, so a scenario's level under one system is
 * never assumed to match its level under the other — see `triageLevel()` in TriageLevels.kt.
 */
enum class TriageSystem {
    /** Korean Triage and Acuity Scale — Korea's national ED triage standard. */
    KTAS,

    /** Emergency Severity Index — the US standard. */
    ESI;

    companion object {
        /**
         * The *default* system for a given [Language] — Korean trainees are far more likely to
         * be studying KTAS, everyone else ESI. Not a hard rule: see
         * `UserPreferences.triageSystem`, which lets a trainee override this independently (an
         * English-speaking Korean nursing student studying KTAS specifically, for instance).
         */
        fun defaultFor(language: Language): TriageSystem = if (language == Language.KOREAN) KTAS else ESI
    }
}
