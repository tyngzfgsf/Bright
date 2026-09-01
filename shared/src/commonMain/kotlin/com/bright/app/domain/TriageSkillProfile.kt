package com.bright.app.domain

import com.bright.app.data.local.SessionEntity
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TriageSystem
import com.bright.app.domain.model.triageLevel

/**
 * Same idea as [SkillProfile], but grouped by triage level (1-5, under whichever
 * [TriageSystem] is active) instead of scenario type — "which acuity level is this trainee
 * actually weakest at," not just which named scenario. Pure functions over plain values, same
 * shape as [SkillProfile].
 */
object TriageSkillProfile {

    data class LevelStat(
        val level: Int,
        val averageScore: Double,
        val answeredCount: Int,
        val sessionCount: Int
    )

    fun compute(sessions: List<SessionEntity>, system: TriageSystem): List<LevelStat> {
        val presetSessions = sessions.filter { it.scenarioType != null && it.answeredCount > 0 }

        return presetSessions
            .mapNotNull { session ->
                val type = runCatching { ScenarioType.valueOf(session.scenarioType!!) }.getOrNull()
                    ?: return@mapNotNull null
                type.triageLevel(system) to session
            }
            .groupBy({ it.first }, { it.second })
            .map { (level, group) ->
                val totalScore = group.sumOf { it.totalScore }
                val totalAnswered = group.sumOf { it.answeredCount }
                LevelStat(
                    level = level,
                    averageScore = totalScore.toDouble() / totalAnswered,
                    answeredCount = totalAnswered,
                    sessionCount = group.size
                )
            }
            .sortedBy { it.level }
    }

    /** Same judgment threshold as [SkillProfile.weakestOf] — see [SkillProfile.MIN_ANSWERS_FOR_JUDGMENT]. */
    fun weakestOf(stats: List<LevelStat>): LevelStat? =
        stats.filter { it.answeredCount >= SkillProfile.MIN_ANSWERS_FOR_JUDGMENT }.minByOrNull { it.averageScore }
}
