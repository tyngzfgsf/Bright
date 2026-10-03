package com.bright.app.domain.model

import com.bright.app.domain.VitalsTrend

/**
 * USER_VITALS_CHECK / AI_VITALS are a mid-scenario vitals check and its reading. Like the
 * USER_ASK / AI_ANSWER side channel, they're never graded and never advance the question.
 */
enum class MessageRole { USER, USER_ASK, AI_QUESTION, AI_FEEDBACK, AI_ANSWER, SYSTEM_SUMMARY, USER_VITALS_CHECK, AI_VITALS }

data class ChatMessage(
    val id: String,
    val role: MessageRole,
    val text: String,
    val score: Int? = null,
    /** What [score] was judged against. Only ever a criterion the session's prompt offered. */
    val criterion: ScoringCriterion? = null,
    /** A score that cited nothing usable — as opposed to one graded before citations existed. */
    val scoreUncited: Boolean = false,
    /** For AI_VITALS: which way the reading moved, as decided on-device by `ScenarioClock`. */
    val vitalsTrend: VitalsTrend? = null,
    val timestampMillis: Long
)
