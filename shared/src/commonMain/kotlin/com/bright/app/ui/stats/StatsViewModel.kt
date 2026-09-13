package com.bright.app.ui.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.analytics.Analytics
import com.bright.app.data.local.ChatDao
import com.bright.app.data.local.QuestionRecordEntity
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.domain.SkillProfile
import com.bright.app.domain.TriageSkillProfile
import com.bright.app.domain.startReviewSession
import com.bright.app.domain.model.TriageSystem
import com.bright.app.util.currentTimeMillis
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

data class StatsUiState(
    val stats: List<SkillProfile.ScenarioStat> = emptyList(),
    val overallAverage: Double? = null,
    val weakest: SkillProfile.ScenarioStat? = null,
    val totalAnswered: Int = 0,
    val triageSystem: TriageSystem = TriageSystem.ESI,
    val triageStats: List<TriageSkillProfile.LevelStat> = emptyList(),
    val weakestTriageLevel: TriageSkillProfile.LevelStat? = null
)

class StatsViewModel(
    private val dao: ChatDao,
    private val preferences: UserPreferences,
    private val analytics: Analytics
) : ViewModel() {

    val uiState: StateFlow<StatsUiState> = combine(
        dao.observeScoredSessions(), preferences.triageSystem
    ) { sessions, triageSystem ->
        val stats = SkillProfile.compute(sessions)
        val triageStats = TriageSkillProfile.compute(sessions, triageSystem)
        StatsUiState(
            stats = stats,
            overallAverage = SkillProfile.overallAverage(stats),
            weakest = SkillProfile.weakestOf(stats),
            totalAnswered = stats.sumOf { it.answeredCount },
            triageSystem = triageSystem,
            triageStats = triageStats,
            weakestTriageLevel = TriageSkillProfile.weakestOf(triageStats)
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), StatsUiState())

    /** The review queue: individual missed/low-scored questions due for review right now. */
    val dueForReview: StateFlow<List<QuestionRecordEntity>> = dao.observeDueQuestionRecords(currentTimeMillis())
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    suspend fun startReviewSession(record: QuestionRecordEntity): String =
        startReviewSession(dao, preferences, analytics, record)
}
