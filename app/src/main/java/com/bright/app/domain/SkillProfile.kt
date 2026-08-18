package com.bright.app.domain

import com.bright.app.data.local.SessionEntity
import com.bright.app.domain.model.ScenarioType

/**
 * The skill-profile engine. Pure functions over session history — no I/O, no framework
 * dependencies — so it's trivially unit-testable and reusable by Home, Stats, and
 * (later) drill-generation logic.
 */
object SkillProfile {

    /** A trainee's accumulated performance in one scenario type. */
    data class ScenarioStat(
        val type: ScenarioType,
        val averageScore: Double,     // 0.0–10.0 across every graded answer, all time
        val answeredCount: Int,       // total graded answers in this type
        val sessionCount: Int,
        val recentAverage: Double?,   // average over the most recent window, null if too little data
        val trend: Trend
    )

    enum class Trend { IMPROVING, DECLINING, FLAT, NOT_ENOUGH_DATA }

    /** Minimum graded answers in a type before we'll call it a strength or weakness. */
    const val MIN_ANSWERS_FOR_JUDGMENT = 3

    /** How many most-recent sessions count as "recent" for the trend comparison. */
    private const val RECENT_SESSION_WINDOW = 3

    /** Trend threshold: recent average must differ from overall by at least this much. */
    private const val TREND_EPSILON = 0.5

    fun compute(sessions: List<SessionEntity>): List<ScenarioStat> {
        val presetSessions = sessions.filter {
            it.scenarioType != null && it.answeredCount > 0
        }

        return presetSessions
            .groupBy { it.scenarioType!! }
            .mapNotNull { (typeName, group) ->
                val type = runCatching { ScenarioType.valueOf(typeName) }.getOrNull()
                    ?: return@mapNotNull null

                val totalScore = group.sumOf { it.totalScore }
                val totalAnswered = group.sumOf { it.answeredCount }
                if (totalAnswered == 0) return@mapNotNull null
                val average = totalScore.toDouble() / totalAnswered

                val recent = group
                    .sortedByDescending { it.lastUpdatedAtMillis }
                    .take(RECENT_SESSION_WINDOW)
                val recentAnswered = recent.sumOf { it.answeredCount }
                val recentAverage = if (recentAnswered > 0 && group.size > RECENT_SESSION_WINDOW) {
                    recent.sumOf { it.totalScore }.toDouble() / recentAnswered
                } else null

                val trend = when {
                    recentAverage == null -> Trend.NOT_ENOUGH_DATA
                    recentAverage - average > TREND_EPSILON -> Trend.IMPROVING
                    average - recentAverage > TREND_EPSILON -> Trend.DECLINING
                    else -> Trend.FLAT
                }

                ScenarioStat(
                    type = type,
                    averageScore = average,
                    answeredCount = totalAnswered,
                    sessionCount = group.size,
                    recentAverage = recentAverage,
                    trend = trend
                )
            }
            .sortedBy { it.averageScore }
    }

    /**
     * The scenario type most worth drilling right now, or null if no type has enough
     * data yet to fairly call it weak. Lowest average wins; the threshold stops one
     * unlucky question from branding a whole topic.
     */
    fun weakestOf(stats: List<ScenarioStat>): ScenarioStat? =
        stats.filter { it.answeredCount >= MIN_ANSWERS_FOR_JUDGMENT }
            .minByOrNull { it.averageScore }

    /** Overall average across every graded answer in every type. */
    fun overallAverage(stats: List<ScenarioStat>): Double? {
        val answered = stats.sumOf { it.answeredCount }
        if (answered == 0) return null
        val weightedSum = stats.sumOf { it.averageScore * it.answeredCount }
        return weightedSum / answered
    }
}
