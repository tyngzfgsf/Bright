package com.bright.app.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.local.ChatDao
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SessionListItem(
    val id: String,
    val scenario: ScenarioType?,
    val customScenario: String?,
    val role: TraineeRole,
    val aiRole: AiCharacterRole,
    val customAiRole: String?,
    val isCompleted: Boolean,
    val startedAtMillis: Long,
    val lastUpdatedAtMillis: Long,
    val summary: String?,
    val averageScore: Double?
)

class HistoryViewModel(private val dao: ChatDao) : ViewModel() {

    val sessions: StateFlow<List<SessionListItem>> = dao.observeSessions()
        .map { list ->
            list.mapNotNull { entity ->
                runCatching {
                    SessionListItem(
                        id = entity.id,
                        scenario = entity.scenarioType?.let { ScenarioType.valueOf(it) },
                        customScenario = entity.customScenario,
                        role = TraineeRole.valueOf(entity.role),
                        aiRole = AiCharacterRole.valueOf(entity.aiRole),
                        customAiRole = entity.customAiRole,
                        isCompleted = entity.isCompleted,
                        startedAtMillis = entity.startedAtMillis,
                        lastUpdatedAtMillis = entity.lastUpdatedAtMillis,
                        summary = entity.summary,
                        averageScore = if (entity.answeredCount > 0) {
                            entity.totalScore.toDouble() / entity.answeredCount
                        } else null
                    )
                }.getOrNull()
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun deleteSession(id: String) {
        viewModelScope.launch { dao.deleteSession(id) }
    }

    fun deleteAll() {
        viewModelScope.launch { dao.deleteAllSessions() }
    }
}
