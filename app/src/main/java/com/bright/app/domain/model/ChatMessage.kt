package com.bright.app.domain.model

enum class MessageRole { USER, USER_ASK, AI_QUESTION, AI_FEEDBACK, AI_ANSWER, SYSTEM_SUMMARY }

data class ChatMessage(
    val id: String,
    val role: MessageRole,
    val text: String,
    val score: Int? = null,
    val timestampMillis: Long
)
