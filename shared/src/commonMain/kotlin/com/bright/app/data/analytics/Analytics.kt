package com.bright.app.data.analytics

import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole

/**
 * Product analytics, behind a platform-neutral interface so the screens and ViewModels that log
 * events can stay in `commonMain`. Android sends to Firebase Analytics; iOS uses [NoOpAnalytics]
 * until it gets its own implementation.
 */
interface Analytics {
    fun log(event: AnalyticsEvent)
}

object NoOpAnalytics : Analytics {
    override fun log(event: AnalyticsEvent) = Unit
}

/**
 * Every event Bright logs, and the only way to log one.
 *
 * NO PERSONALLY IDENTIFYING INFORMATION. That's enforced by shape, not by convention: every
 * parameter is an enum, a [ScenarioLabel], a number, or a boolean. No constructor here accepts
 * a String — trainee answers, custom scenario text, custom AI roles and the Groq key are all
 * typed by the user, and none of them has a way in. A custom scenario is reported only as the
 * literal "custom".
 *
 * Parameter values are limited to String / Long / Double / Boolean so every platform can map
 * them directly (Firebase takes String, Long and Double; Boolean is sent as 0/1).
 */
sealed class AnalyticsEvent(val name: String) {
    abstract val params: Map<String, Any>

    enum class OnboardingStep(val label: String) {
        LANGUAGE("language"),
        KEY_ENTRY("key_entry"),
        KEY_SAVED("key_saved"),
        KEY_SKIPPED("key_skipped")
    }

    /** How a session was started — review sessions also log [ReviewSessionStarted]. */
    enum class SessionSource(val label: String) {
        HOME("home"),
        WEAK_SPOT("weak_spot"),
        REVIEW("review")
    }

    data class OnboardingStepReached(val step: OnboardingStep) : AnalyticsEvent("onboarding_step") {
        override val params get() = mapOf("step" to step.label)
    }

    data class SessionStarted(
        val scenario: ScenarioLabel,
        val difficulty: Difficulty,
        val traineeRole: TraineeRole,
        val source: SessionSource
    ) : AnalyticsEvent("session_started") {
        override val params get() = mapOf(
            "scenario_type" to scenario.value,
            "difficulty" to difficulty.name.lowercase(),
            "trainee_role" to traineeRole.name.lowercase(),
            "source" to source.label
        )
    }

    data class SessionCompleted(
        val scenario: ScenarioLabel,
        val answeredCount: Int,
        /** Null when nothing was graded (ended before answering anything). */
        val averageScore: Double?,
        val isReview: Boolean
    ) : AnalyticsEvent("session_completed") {
        override val params get() = buildMap<String, Any> {
            put("scenario_type", scenario.value)
            put("answered_count", answeredCount.toLong())
            averageScore?.let { put("average_score", it) }
            put("is_review", isReview)
        }
    }

    /** The trainee left a session without ending it. Fires on each exit, including re-opened sessions. */
    data class SessionAbandoned(
        val scenario: ScenarioLabel,
        val answeredCount: Int,
        val isReview: Boolean
    ) : AnalyticsEvent("session_abandoned") {
        override val params get() = mapOf(
            "scenario_type" to scenario.value,
            "answered_count" to answeredCount.toLong(),
            "is_review" to isReview
        )
    }

    data class AnswerScored(
        val scenario: ScenarioLabel,
        val score: Int,
        /** 1-based position of this graded answer within its session. */
        val answerNumber: Int,
        val isReview: Boolean
    ) : AnalyticsEvent("answer_scored") {
        override val params get() = mapOf(
            "scenario_type" to scenario.value,
            "score" to score.toLong(),
            "answer_number" to answerNumber.toLong(),
            "is_review" to isReview
        )
    }

    data class ReviewSessionStarted(
        val scenario: ScenarioLabel,
        /** The score of the missed answer being reviewed. */
        val originalScore: Int,
        /** Whole days past its due date, 0 if due today. */
        val daysOverdue: Int
    ) : AnalyticsEvent("review_session_started") {
        override val params get() = mapOf(
            "scenario_type" to scenario.value,
            "original_score" to originalScore.toLong(),
            "days_overdue" to daysOverdue.toLong()
        )
    }

    /** A completed session made today a new active day. Same-day repeats don't fire. */
    data class StreakDayReached(val streakLength: Int) : AnalyticsEvent("streak_day_reached") {
        override val params get() = mapOf("streak_length" to streakLength.toLong())
    }

    /** A Groq key was saved from Settings. The key itself is never included. */
    data class SettingsKeyAdded(val replacedExistingKey: Boolean) : AnalyticsEvent("settings_key_added") {
        override val params get() = mapOf("replaced_existing" to replacedExistingKey)
    }
}

/**
 * A scenario as analytics sees it: a built-in [ScenarioType]'s name, or "custom". The private
 * constructor means the custom scenario text — written by the trainee — can't become one.
 */
class ScenarioLabel private constructor(val value: String) {
    override fun toString() = value

    companion object {
        fun of(scenarioType: String?, customScenario: String?): ScenarioLabel {
            val builtIn = ScenarioType.entries.firstOrNull { it.name == scenarioType }
            return ScenarioLabel(
                if (builtIn == null || !customScenario.isNullOrBlank()) "custom" else builtIn.name.lowercase()
            )
        }
    }
}
