package com.bright.app.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GroqChatRequest(
    val model: String,
    val messages: List<GroqMessage>,
    val temperature: Double = 0.85,
    @SerialName("max_completion_tokens") val maxCompletionTokens: Int = 700,
    @SerialName("response_format") val responseFormat: GroqResponseFormat? = null
)

@Serializable
data class GroqResponseFormat(
    val type: String = "json_object"
)

@Serializable
data class GroqMessage(
    val role: String, // "system" | "user" | "assistant"
    val content: String
)

@Serializable
data class GroqChatResponse(
    val id: String? = null,
    val choices: List<GroqChoice> = emptyList(),
    val error: GroqError? = null
)

@Serializable
data class GroqChoice(
    val index: Int? = null,
    val message: GroqMessage? = null,
    @SerialName("finish_reason") val finishReason: String? = null
)

@Serializable
data class GroqError(
    val message: String? = null,
    val type: String? = null
)
