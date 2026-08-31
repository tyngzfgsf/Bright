package com.bright.app.ui.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.QuestionRecordEntity
import com.bright.app.data.local.SessionEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.SkillProfile
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.Difficulty
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.TraineeRole
import com.bright.app.util.currentTimeMillis
import com.bright.app.util.randomId
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class StatsUiState(
    val stats: List<SkillProfile.ScenarioStat> = emptyList(),
    val overallAverage: Double? = null,
    val weakest: SkillProfile.ScenarioStat? = null,
    val totalAnswered: Int = 0
)

class StatsViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences
) : ViewModel() {

    val uiState: StateFlow<StatsUiState> = dao.observeScoredSessions()
        .map { sessions ->
            val stats = SkillProfile.compute(sessions)
            StatsUiState(
                stats = stats,
                overallAverage = SkillProfile.overallAverage(stats),
                weakest = SkillProfile.weakestOf(stats),
                totalAnswered = stats.sumOf { it.answeredCount }
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), StatsUiState())

    /** The review queue: individual missed/low-scored questions due for review right now. */
    val dueForReview: StateFlow<List<QuestionRecordEntity>> = dao.observeDueQuestionRecords(currentTimeMillis())
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * Starts a fresh session on the same scenario as [record] — the AI generates a new,
     * similar case rather than replaying the exact same text — tagged so grading it advances
     * [record]'s own SM-2 schedule instead of only creating an unrelated new one.
     */
    suspend fun startReviewSession(record: QuestionRecordEntity): String {
        val languageCode = preferences.languageCode.first() ?: Language.fromSystemDefault().code
        val now = currentTimeMillis()
        val id = randomId()
        val aiRole = if (kotlin.random.Random.nextBoolean()) AiCharacterRole.PATIENT else AiCharacterRole.DOCTOR
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
}
