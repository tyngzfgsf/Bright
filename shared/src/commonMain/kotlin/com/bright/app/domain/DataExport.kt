package com.bright.app.domain

import com.bright.app.data.local.ChatDao
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.util.currentLocalEpochDay
import com.bright.app.util.currentTimeMillis
import com.bright.app.util.formatIsoTimestamp
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Everything Bright keeps about the trainee, as one self-describing JSON document — the
 * Settings "Export my data" file. JSON rather than CSV because the data is nested (sessions
 * own their transcripts and graded answers) and a CSV would need several files to hold it.
 *
 * Deliberately its own set of types rather than serializing the Room entities directly: this
 * is a public file format, so it shouldn't change shape whenever a column is added, and a few
 * fields (raw epoch-day numbers, running score sums) mean nothing outside the app.
 */
object DataExport {

    private const val FORMAT_VERSION = 1

    private val json = Json {
        prettyPrint = true
        encodeDefaults = true
    }

    /** `bright-export-2026-09-23.json` — dated so repeated exports don't overwrite each other. */
    fun fileName(): String = "bright-export-${formatIsoTimestamp(currentTimeMillis()).take(10)}.json"

    suspend fun build(dao: ChatDao, preferences: UserPreferences, appVersion: String): String {
        val sessions = dao.getAllSessions()
        val messagesBySession = dao.getAllMessages().groupBy { it.sessionId }
        val recordsBySession = dao.getAllQuestionRecords().groupBy { it.sessionId }
        val triageSystem = preferences.triageSystem.first()

        val scenarioStats = SkillProfile.compute(sessions)
        val triageStats = TriageSkillProfile.compute(sessions, triageSystem)

        val export = ExportFile(
            formatVersion = FORMAT_VERSION,
            exportedAt = formatIsoTimestamp(currentTimeMillis()),
            appVersion = appVersion,
            currentStreakDays = DailyStreak.displayedCount(preferences.streakState.first(), currentLocalEpochDay()),
            skillProfile = ExportSkillProfile(
                overallAverageScore = SkillProfile.overallAverage(scenarioStats)?.roundTo1(),
                weakestScenario = SkillProfile.weakestOf(scenarioStats)?.type?.name,
                byScenario = scenarioStats.map {
                    ExportScenarioStat(
                        scenario = it.type.name,
                        averageScore = it.averageScore.roundTo1(),
                        recentAverageScore = it.recentAverage?.roundTo1(),
                        trend = it.trend.name,
                        gradedAnswers = it.answeredCount,
                        sessions = it.sessionCount
                    )
                },
                triageSystem = triageSystem.name,
                byTriageLevel = triageStats.map {
                    ExportTriageStat(
                        level = it.level,
                        averageScore = it.averageScore.roundTo1(),
                        gradedAnswers = it.answeredCount,
                        sessions = it.sessionCount
                    )
                }
            ),
            sessions = sessions.map { session ->
                ExportSession(
                    id = session.id,
                    scenario = session.scenarioType,
                    customScenario = session.customScenario,
                    yourRole = session.role,
                    aiRole = session.customAiRole ?: session.aiRole,
                    difficulty = session.difficulty,
                    language = session.languageCode,
                    startedAt = formatIsoTimestamp(session.startedAtMillis),
                    lastUpdatedAt = formatIsoTimestamp(session.lastUpdatedAtMillis),
                    completed = session.isCompleted,
                    summary = session.summary,
                    averageScore = if (session.answeredCount > 0) {
                        (session.totalScore.toDouble() / session.answeredCount).roundTo1()
                    } else null,
                    gradedAnswerCount = session.answeredCount,
                    reviewOfAnswerId = session.reviewOfRecordId,
                    gradedAnswers = recordsBySession[session.id].orEmpty().map { record ->
                        ExportGradedAnswer(
                            id = record.id,
                            question = record.questionText,
                            answer = record.answerText,
                            score = record.score,
                            answeredAt = formatIsoTimestamp(record.timestampMillis),
                            nextReviewDue = formatIsoTimestamp(record.dueAtMillis)
                        )
                    },
                    transcript = messagesBySession[session.id].orEmpty().map { message ->
                        ExportMessage(
                            role = message.role,
                            text = message.text,
                            score = message.score,
                            at = formatIsoTimestamp(message.timestampMillis)
                        )
                    }
                )
            }
        )
        return json.encodeToString(ExportFile.serializer(), export)
    }

    private fun Double.roundTo1(): Double = kotlin.math.round(this * 10) / 10
}

@Serializable
private data class ExportFile(
    val format: String = "bright-data-export",
    val formatVersion: Int,
    val exportedAt: String,
    val appVersion: String,
    val currentStreakDays: Int,
    val skillProfile: ExportSkillProfile,
    val sessions: List<ExportSession>
)

@Serializable
private data class ExportSkillProfile(
    val overallAverageScore: Double?,
    val weakestScenario: String?,
    val byScenario: List<ExportScenarioStat>,
    val triageSystem: String,
    val byTriageLevel: List<ExportTriageStat>
)

@Serializable
private data class ExportScenarioStat(
    val scenario: String,
    val averageScore: Double,
    val recentAverageScore: Double?,
    val trend: String,
    val gradedAnswers: Int,
    val sessions: Int
)

@Serializable
private data class ExportTriageStat(
    val level: Int,
    val averageScore: Double,
    val gradedAnswers: Int,
    val sessions: Int
)

@Serializable
private data class ExportSession(
    val id: String,
    val scenario: String?,
    val customScenario: String?,
    val yourRole: String,
    val aiRole: String,
    val difficulty: String,
    val language: String,
    val startedAt: String,
    val lastUpdatedAt: String,
    val completed: Boolean,
    val summary: String?,
    val averageScore: Double?,
    val gradedAnswerCount: Int,
    val reviewOfAnswerId: String?,
    val gradedAnswers: List<ExportGradedAnswer>,
    val transcript: List<ExportMessage>
)

@Serializable
private data class ExportGradedAnswer(
    val id: String,
    val question: String,
    val answer: String,
    val score: Int,
    val answeredAt: String,
    val nextReviewDue: String
)

@Serializable
private data class ExportMessage(
    val role: String,
    val text: String,
    val score: Int?,
    val at: String
)
