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

// --- Model listing (GET /openai/v1/models) ---

@Serializable
data class GroqModelsResponse(
    val data: List<GroqModelInfo> = emptyList()
)

@Serializable
data class GroqModelInfo(
    val id: String,
    val active: Boolean = true,
    @SerialName("context_window") val contextWindow: Int? = null,
    @SerialName("owned_by") val ownedBy: String? = null
)

/**
 * Rate-limit usage, read from the x-ratelimit-* response headers Groq sends on every request.
 * These reflect the current-minute window (RPM/TPM) — Groq doesn't expose a daily total in
 * headers, so fields are named accordingly and are null if a given header wasn't present.
 */
data class GroqUsageInfo(
    val remainingRequests: Int? = null,
    val limitRequests: Int? = null,
    val remainingTokens: Int? = null,
    val limitTokens: Int? = null
)

data class ModelsAndUsage(
    val models: List<String>,
    val usage: GroqUsageInfo?
)
