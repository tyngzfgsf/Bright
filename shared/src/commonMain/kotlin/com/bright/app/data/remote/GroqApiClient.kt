package com.bright.app.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

private const val GROQ_BASE_URL = "https://api.groq.com"

/**
 * Thin wrapper over Ktor's HttpClient for the two Groq endpoints the app calls. No explicit
 * engine is chosen here — Ktor's `HttpClient()` picks whichever engine is on the classpath at
 * runtime (ktor-client-okhttp on Android, ktor-client-darwin on iOS), so this class is the same
 * on every platform. Deliberately mirrors the old Retrofit `GroqApiService` interface's shape
 * (raw HttpResponse out, not parsed) so GroqRepository's error-handling logic barely changed.
 */
class GroqApiClient(enableLogging: Boolean = false) {

    private val client = HttpClient {
        expectSuccess = false // we inspect status codes ourselves, like Retrofit's Response<T> did
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                    explicitNulls = false
                }
            )
        }
        if (enableLogging) {
            install(Logging) { level = LogLevel.BODY }
        }
    }

    suspend fun createChatCompletion(bearerToken: String, request: GroqChatRequest): HttpResponse =
        client.post("$GROQ_BASE_URL/openai/v1/chat/completions") {
            header("Authorization", bearerToken)
            contentType(ContentType.Application.Json)
            setBody(request)
        }

    suspend fun listModels(bearerToken: String): HttpResponse =
        client.get("$GROQ_BASE_URL/openai/v1/models") {
            header("Authorization", bearerToken)
        }
}
