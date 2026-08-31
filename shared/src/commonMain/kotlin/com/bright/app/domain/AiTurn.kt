package com.bright.app.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class AiTurn(
    val score: Int? = null,
    val feedback: String? = null,
    @SerialName("next_prompt") val nextPrompt: String = "",
    @SerialName("session_complete") val sessionComplete: Boolean = false
)

object AiTurnParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    /**
     * Groq's json_object mode is usually clean, but models occasionally wrap the JSON in a
     * markdown code fence or add a stray sentence before/after it. Strip down to the first
     * `{...}` block before parsing, and fall back to treating the raw text as the next question
     * if it still doesn't parse — a malformed turn shouldn't crash the session.
     */
    fun parse(raw: String): AiTurn {
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        val candidate = if (start >= 0 && end > start) raw.substring(start, end + 1) else raw

        return try {
            json.decodeFromString<AiTurn>(candidate)
        } catch (e: Exception) {
            AiTurn(score = null, feedback = null, nextPrompt = raw.trim(), sessionComplete = false)
        }
    }
}
