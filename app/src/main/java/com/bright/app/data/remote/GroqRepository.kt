package com.bright.app.data.remote

import com.bright.app.util.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

class GroqRepository(
    private val apiService: GroqApiService = NetworkModule.groqApiService
) {

    /**
     * Sends the full conversation (system prompt + turns so far) to Groq and returns the
     * assistant's reply text, or a human-readable error.
     */
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

    private fun parseErrorMessage(errorBody: String?): String? {
        if (errorBody.isNullOrBlank()) return null
        return Regex("\"message\"\\s*:\\s*\"([^\"]+)\"")
            .find(errorBody)?.groupValues?.getOrNull(1)
    }
}
