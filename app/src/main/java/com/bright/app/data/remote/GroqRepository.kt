package com.bright.app.data.remote

import com.bright.app.util.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

class GroqRepository(
    private val apiService: GroqApiService = NetworkModule.groqApiService
) {

    suspend fun sendConversation(
        apiKey: String,
        model: String,
        messages: List<GroqMessage>,
        jsonMode: Boolean = false
    ): ApiResult<String> = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) {
            return@withContext ApiResult.Error("Missing Groq API key.")
        }
        try {
            val response = apiService.createChatCompletion(
                bearerToken = "Bearer $apiKey",
                request = GroqChatRequest(
                    model = model,
                    messages = messages,
                    responseFormat = if (jsonMode) GroqResponseFormat() else null
                )
            )

            if (!response.isSuccessful) {
                val errorBody = response.errorBody()?.string()
                return@withContext ApiResult.Error(
                    parseErrorMessage(errorBody) ?: "Request failed (HTTP ${response.code()})."
                )
            }

            val body = response.body()
            val reply = body?.choices?.firstOrNull()?.message?.content

            if (reply.isNullOrBlank()) {
                ApiResult.Error(body?.error?.message ?: "Empty response from the model.")
            } else {
                ApiResult.Success(reply.trim())
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error — check your connection and try again.")
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Unexpected error talking to Groq.")
        }
    }

    /**
     * Fetches the list of active chat-capable models plus the current rate-limit usage,
     * read straight from the response headers Groq attaches to every request. One call
     * serves both — the model picker and the usage readout in Settings.
     */
    suspend fun fetchModelsAndUsage(apiKey: String): ApiResult<ModelsAndUsage> = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) {
            return@withContext ApiResult.Error("Missing Groq API key.")
        }
        try {
            val response = apiService.listModels(bearerToken = "Bearer $apiKey")

            if (!response.isSuccessful) {
                val errorBody = response.errorBody()?.string()
                return@withContext ApiResult.Error(
                    parseErrorMessage(errorBody) ?: "Request failed (HTTP ${response.code()})."
                )
            }

            val body = response.body()
            val chatModels = body?.data
                .orEmpty()
                .filter { it.active }
                .map { it.id }
                .filterNot { id -> NON_CHAT_KEYWORDS.any { id.contains(it, ignoreCase = true) } }
                .sorted()

            val headers = response.headers()
            val usage = GroqUsageInfo(
                remainingRequests = headers["x-ratelimit-remaining-requests"]?.toIntOrNull(),
                limitRequests = headers["x-ratelimit-limit-requests"]?.toIntOrNull(),
                remainingTokens = headers["x-ratelimit-remaining-tokens"]?.toIntOrNull(),
                limitTokens = headers["x-ratelimit-limit-tokens"]?.toIntOrNull()
            )

            if (chatModels.isEmpty()) {
                ApiResult.Error("Groq didn't return any models for this key.")
            } else {
                ApiResult.Success(ModelsAndUsage(chatModels, usage))
            }
        } catch (e: IOException) {
            ApiResult.Error("Network error — check your connection and try again.")
        } catch (e: Exception) {
            ApiResult.Error(e.message ?: "Unexpected error talking to Groq.")
        }
    }

    private fun parseErrorMessage(errorBody: String?): String? {
        if (errorBody.isNullOrBlank()) return null
        return Regex("\"message\"\\s*:\\s*\"([^\"]+)\"")
            .find(errorBody)?.groupValues?.getOrNull(1)
    }

    companion object {
        // Groq hosts speech/classifier models alongside chat models on the same /models
        // endpoint — filter those out since picking one here would break the chat drill.
        private val NON_CHAT_KEYWORDS = listOf("whisper", "tts", "orpheus", "guard", "moderation")
    }
}
