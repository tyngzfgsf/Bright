package com.bright.app.data.billing

import com.bright.app.data.remote.GroqMessage
import com.bright.app.domain.billing.Entitlement
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Client for bright-proxy, the Cloudflare Worker that is Bright's whole backend: hosted AI turns
 * (metered per drill) and the account every payment system feeds into. Same Ktor stack as
 * [com.bright.app.data.remote.GroqApiClient], so it works unchanged on Android and iOS.
 *
 * Every call takes a Firebase ID token — the Worker verifies it against Google's keys.
 */
class WorkerApi(private val baseUrl: String) {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; isLenient = true }

    private val client = HttpClient {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
    }

    sealed interface TurnResult {
        /** The model's reply: the turn's JSON for scenario turns, prose for `text` ones. */
        data class Success(val content: String) : TurnResult
        data object DrillLimit : TurnResult
        /** The drill id expired or used up its turns — start a new drill and retry. */
        data object DrillEnded : TurnResult
        data object Unauthenticated : TurnResult
        data class Error(val message: String) : TurnResult
    }

    @Serializable
    private data class TurnRequest(
        val messages: List<GroqMessage>,
        @kotlinx.serialization.SerialName("drill_id") val drillId: String,
        val format: String
    )

    suspend fun turn(idToken: String, drillId: String, messages: List<GroqMessage>, expectJson: Boolean): TurnResult =
        withContext(Dispatchers.Default) {
            try {
                val response = client.post("$baseUrl/v1/turn") {
                    header("Authorization", "Bearer $idToken")
                    contentType(ContentType.Application.Json)
                    setBody(TurnRequest(messages, drillId, if (expectJson) "json" else "text"))
                }
                val body = parse(response)
                when {
                    response.status.value == 401 -> TurnResult.Unauthenticated
                    response.status.value == 429 && body.code() == "drill_limit" -> TurnResult.DrillLimit
                    response.status.value == 409 -> TurnResult.DrillEnded
                    !response.status.isSuccess() -> TurnResult.Error(body.error() ?: "Request failed (HTTP ${response.status.value}).")
                    // Scenario turns come back already parsed; re-encode so AiTurnParser sees the
                    // same JSON string a direct Groq call would have produced.
                    body?.get("turn") != null -> TurnResult.Success(body["turn"].toString())
                    else -> TurnResult.Success(body?.get("text")?.jsonPrimitive?.contentOrNull.orEmpty())
                }
            } catch (e: Exception) {
                TurnResult.Error(e.message ?: "Couldn't reach Bright's servers.")
            }
        }

    suspend fun account(idToken: String, locale: String): BillingResult<Entitlement> =
        request(idToken) { client.get("$baseUrl/v1/account") { auth(idToken); parameter("locale", locale) } }
            .map { json.decodeFromString<Entitlement>(it) }

    /** Website (Paddle) subscription: cancel at period end, or take the exit offer instead. */
    suspend fun cancelWebSubscription(idToken: String, acceptRetentionOffer: Boolean): BillingResult<Entitlement> =
        request(idToken) {
            client.post("$baseUrl/v1/web/cancel") {
                auth(idToken)
                contentType(ContentType.Application.Json)
                setBody(mapOf("acceptRetentionOffer" to acceptRetentionOffer))
            }
        }.map { json.decodeFromString<Entitlement>(it) }

    suspend fun resumeWebSubscription(idToken: String): BillingResult<Entitlement> =
        request(idToken) { client.post("$baseUrl/v1/web/resume") { auth(idToken) } }
            .map { json.decodeFromString<Entitlement>(it) }

    /** A store-side exit offer was taken; the Worker remembers so it isn't offered twice. */
    suspend fun markRetentionOfferUsed(idToken: String): BillingResult<Entitlement> =
        request(idToken) { client.post("$baseUrl/v1/retention-offer-used") { auth(idToken) } }
            .map { json.decodeFromString<Entitlement>(it) }

    private fun io.ktor.client.request.HttpRequestBuilder.auth(idToken: String) =
        header("Authorization", "Bearer $idToken")

    private suspend fun request(idToken: String, block: suspend () -> HttpResponse): BillingResult<String> =
        withContext(Dispatchers.Default) {
            try {
                val response = block()
                val text = response.bodyAsText()
                when {
                    response.status.value == 401 -> BillingResult.SignedOut
                    !response.status.isSuccess() ->
                        BillingResult.Failure(parseText(text).error() ?: "Request failed (HTTP ${response.status.value}).")
                    else -> BillingResult.Success(text)
                }
            } catch (e: Exception) {
                BillingResult.Failure(e.message ?: "Couldn't reach Bright's servers.")
            }
        }

    private suspend fun parse(response: HttpResponse): JsonObject? = parseText(response.bodyAsText())

    private fun parseText(text: String): JsonObject? =
        runCatching { json.parseToJsonElement(text) as? JsonObject }.getOrNull()

    private fun JsonObject?.code(): String? = (this?.get("code") as? JsonPrimitive)?.contentOrNull
    private fun JsonObject?.error(): String? = (this?.get("error") as? JsonPrimitive)?.contentOrNull

    private inline fun <T, R> BillingResult<T>.map(transform: (T) -> R): BillingResult<R> = when (this) {
        is BillingResult.Success -> runCatching { BillingResult.Success(transform(data)) }
            .getOrElse { BillingResult.Failure(it.message ?: "Unexpected response.") }
        is BillingResult.Failure -> this
        BillingResult.SignedOut -> BillingResult.SignedOut
    }
}

sealed interface BillingResult<out T> {
    data class Success<T>(val data: T) : BillingResult<T>
    data object SignedOut : BillingResult<Nothing>
    data class Failure(val message: String) : BillingResult<Nothing>
}
