package com.bright.app.domain

import com.bright.app.data.analytics.Analytics
import com.bright.app.data.analytics.AnalyticsEvent
import com.bright.app.data.analytics.ScenarioLabel
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.QuestionRecordEntity
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TraineeRole
import com.bright.app.util.currentTimeMillis
import com.bright.app.util.randomId
import kotlinx.coroutines.flow.first
import kotlin.random.Random

private const val DAY_MILLIS = 24L * 60 * 60 * 1000

/**
 * Starts a fresh session on the same scenario as [record] — the AI generates a new, similar
 * case rather than replaying the exact same text — tagged so grading it advances [record]'s
 * own SM-2 schedule instead of only creating an unrelated new one. Shared between Home's
 * one-tap "Review now" and the Stats screen's full review queue.
 */
suspend fun startReviewSession(
    dao: ChatDao,
    preferences: UserPreferences,
    analytics: Analytics,
    record: QuestionRecordEntity
): String {
    val languageCode = preferences.languageCode.first() ?: Language.fromSystemDefault().code
    val now = currentTimeMillis()
    val id = randomId()
    val aiRole = if (Random.nextBoolean()) AiCharacterRole.PATIENT else AiCharacterRole.DOCTOR
    dao.insertSession(
        SessionEntity(
            id = id,
            scenarioType = record.scenarioType,
            customScenario = record.customScenario,
            aiRole = aiRole.name,
            customAiRole = null,
            role = TraineeRole.DOCTOR.name,
            difficulty = Difficulty.INTERMEDIATE.name,
            languageCode = languageCode,
            startedAtMillis = now,
            lastUpdatedAtMillis = now,
            isCompleted = false,
            reviewOfRecordId = record.id
        )
    )
    val scenario = ScenarioLabel.of(record.scenarioType, record.customScenario)
    analytics.log(
        AnalyticsEvent.SessionStarted(
            scenario = scenario,
            difficulty = Difficulty.INTERMEDIATE,
            traineeRole = TraineeRole.DOCTOR,
            source = AnalyticsEvent.SessionSource.REVIEW
        )
    )
    analytics.log(
        AnalyticsEvent.ReviewSessionStarted(
            scenario = scenario,
            originalScore = record.score,
            daysOverdue = ((now - record.dueAtMillis).coerceAtLeast(0) / DAY_MILLIS).toInt()
        )
    )
    return id
}
