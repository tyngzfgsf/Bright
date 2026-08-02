package com.bright.app.domain.model

enum class MessageRole { USER, AI_QUESTION, AI_FEEDBACK, SYSTEM_SUMMARY }

data class ChatMessage(
    val id: String,
    val role: MessageRole,
    val text: String,
    val score: Int? = null,
    val timestampMillis: Long
)
