package com.bright.app.domain

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

/**
 * Starts a fresh session on the same scenario as [record] — the AI generates a new, similar
 * case rather than replaying the exact same text — tagged so grading it advances [record]'s
 * own SM-2 schedule instead of only creating an unrelated new one. Shared between Home's
 * one-tap "Review now" and the Stats screen's full review queue.
 */
suspend fun startReviewSession(
    dao: ChatDao,
    preferences: UserPreferences,
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
    return id
}
