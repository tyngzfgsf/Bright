package com.bright.app.data.remote

import com.bright.app.util.ApiResult
import io.ktor.client.call.body
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Outcome of a hosted (backend-proxied) call — richer than [ApiResult] because the app reacts to each case differently. */
sealed interface HostedChatResult {
    data class Success(val text: String) : HostedChatResult

    /** The drill ticket was missing, expired or used up (HTTP 402). Start a new drill and retry. */
    data object DrillRejected : HostedChatResult

    /** The Firebase session is no longer valid (HTTP 401). */
    data object Unauthenticated : HostedChatResult

    data class Error(val message: String) : HostedChatResult
}

class GroqRepository(
    private val apiClient: GroqApiClient = GroqApiClient()
) {
    // Dispatchers.IO isn't public commonMain API on Kotlin/Native with this coroutines
    // version (it's `internal` there) — Default is the portable choice. Ktor's engines are
    // already non-blocking, so this isn't giving up much versus a dedicated IO pool anyway.

    suspend fun sendConversation(
        apiKey: String,
        model: String,
        messages: List<GroqMessage>,
        jsonMode: Boolean = false
    ): ApiResult<String> = withContext(Dispatchers.Default) {
        if (apiKey.isBlank()) {
            return@withContext ApiResult.Error("Missing Groq API key.")
        }
        try {
            val response = apiClient.createChatCompletion(
                bearerToken = "Bearer $apiKey",
                request = GroqChatRequest(
                    model = model,
                    messages = messages,
                    responseFormat = if (jsonMode) GroqResponseFormat() else null
                )
            )

            if (!response.status.isSuccess()) {
                return@withContext ApiResult.Error(
                    parseErrorMessage(response.bodyAsText()) ?: "Request failed (HTTP ${response.status.value})."
                )
            }

            val body: GroqChatResponse = response.body()
            val reply = body.choices.firstOrNull()?.message?.content

            if (reply.isNullOrBlank()) {
                ApiResult.Error(body.error?.message ?: "Empty response from the model.")
            } else {
                ApiResult.Success(reply.trim())
            }
        } catch (e: Exception) {
            // Deliberately one catch-all rather than a typed "network error" branch: Ktor's
            // OkHttp (Android) and Darwin (iOS) engines don't share one common connectivity
            // exception type, so trying to special-case "no network" here would only work
            // reliably on one platform. e.message from either engine is usually already a
            // readable reason (e.g. "Unable to resolve host", or the wrapped NSError's
            // description on iOS), so surface that instead of a hardcoded guess.
            ApiResult.Error(e.message ?: "Unexpected error talking to Groq.")
        }
    }

    /**
     * The hosted path: same conversation, sent through the backend proxy with the trainee's
     * Firebase ID token and a metered drill ticket instead of a Groq key. The proxy picks the
     * model itself, so none is passed.
     */
    suspend fun sendHostedConversation(
        firebaseIdToken: String,
        drillId: String,
        messages: List<GroqMessage>,
        jsonMode: Boolean = false
    ): HostedChatResult = withContext(Dispatchers.Default) {
        try {
            val response = apiClient.createHostedChatCompletion(
                firebaseIdToken = firebaseIdToken,
                request = GroqChatRequest(
                    // Ignored by the proxy (it forces its own hosted model); required by the type.
                    model = "",
                    messages = messages,
                    responseFormat = if (jsonMode) GroqResponseFormat() else null,
                    drillId = drillId
                )
            )
            when (response.status.value) {
                401 -> return@withContext HostedChatResult.Unauthenticated
                402 -> return@withContext HostedChatResult.DrillRejected
            }
            if (!response.status.isSuccess()) {
                return@withContext HostedChatResult.Error(
                    parseErrorMessage(response.bodyAsText()) ?: "Request failed (HTTP ${response.status.value})."
                )
            }
            val body: GroqChatResponse = response.body()
            val reply = body.choices.firstOrNull()?.message?.content
            if (reply.isNullOrBlank()) {
                HostedChatResult.Error(body.error?.message ?: "Empty response from the model.")
            } else {
                HostedChatResult.Success(reply.trim())
            }
        } catch (e: Exception) {
            HostedChatResult.Error(e.message ?: "Unexpected error talking to Bright's servers.")
        }
    }

    /**
     * Fetches the list of active chat-capable models plus the current rate-limit usage,
     * read straight from the response headers Groq attaches to every request. One call
     * serves both — the model picker and the usage readout in Settings.
     */
    suspend fun fetchModelsAndUsage(apiKey: String): ApiResult<ModelsAndUsage> = withContext(Dispatchers.Default) {
        if (apiKey.isBlank()) {
            return@withContext ApiResult.Error("Missing Groq API key.")
        }
        try {
            val response: HttpResponse = apiClient.listModels(bearerToken = "Bearer $apiKey")

            if (!response.status.isSuccess()) {
                return@withContext ApiResult.Error(
                    parseErrorMessage(response.bodyAsText()) ?: "Request failed (HTTP ${response.status.value})."
                )
            }

            val body: GroqModelsResponse = response.body()
            val chatModels = body.data
                .filter { it.active }
                .map { it.id }
                .filterNot { id -> NON_CHAT_KEYWORDS.any { id.contains(it, ignoreCase = true) } }
                .sorted()

            val usage = GroqUsageInfo(
                remainingRequests = response.headers["x-ratelimit-remaining-requests"]?.toIntOrNull(),
                limitRequests = response.headers["x-ratelimit-limit-requests"]?.toIntOrNull(),
                remainingTokens = response.headers["x-ratelimit-remaining-tokens"]?.toIntOrNull(),
                limitTokens = response.headers["x-ratelimit-limit-tokens"]?.toIntOrNull()
            )

            if (chatModels.isEmpty()) {
                ApiResult.Error("Groq didn't return any models for this key.")
            } else {
                ApiResult.Success(ModelsAndUsage(chatModels, usage))
            }
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
