package com.bright.app.ui.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.domain.SkillProfile
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class StatsUiState(
    val stats: List<SkillProfile.ScenarioStat> = emptyList(),
    val overallAverage: Double? = null,
    val weakest: SkillProfile.ScenarioStat? = null,
    val totalAnswered: Int = 0
)

class StatsViewModel(dao: ChatDao) : ViewModel() {

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
}
