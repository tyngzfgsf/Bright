package com.bright.app.data.remote

import com.bright.app.data.auth.AuthService
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.WorkerApi
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.util.ApiResult
import com.bright.app.util.randomId
import kotlinx.coroutines.flow.first

/** What a model call came back with, as the chat screen needs to tell the cases apart. */
sealed interface AiResult {
    data class Success(val text: String) : AiResult

    /** Hosted, and the month's drills are spent — show the paywall. */
    data object OutOfDrills : AiResult

    /** No own key and not signed in: nothing can run a drill yet. */
    data object NotConnected : AiResult

    data class Error(val message: String) : AiResult
}

/**
 * The single place that decides how a model call is made:
 *
 * - **Own Groq key saved → straight to Groq**, exactly as before. Unmetered: the trainee is
 *   paying Groq themselves, so there's nothing for Bright to cap.
 * - **Otherwise, signed in → through bright-proxy** (the Cloudflare Worker, same backend as the
 *   website), with a drill id. The first call carrying a new id spends one of the month's drills;
 *   every later call in that session reuses it.
 *
 * BYOK wins when both are available so existing users' setups keep behaving identically.
 */
class AiGateway(
    private val preferences: UserPreferences,
    private val groqRepository: GroqRepository,
    private val workerApi: WorkerApi,
    private val authService: AuthService?,
    private val billing: BillingRepository
) {
    /**
     * [expectJson]: scenario turns (the AI's reply is an AiTurn JSON object). Side questions and
     * the debrief are prose. Only the hosted path needs telling — BYOK prompts say it themselves.
     */
    suspend fun send(sessionId: String, messages: List<GroqMessage>, expectJson: Boolean): AiResult {
        val apiKey = preferences.groqApiKey.first().orEmpty()
        if (apiKey.isNotBlank()) {
            val model = preferences.groqModel.first()
            return when (val r = groqRepository.sendConversation(apiKey, model, messages, jsonMode = false)) {
                is ApiResult.Success -> AiResult.Success(r.data)
                is ApiResult.Error -> AiResult.Error(r.message)
            }
        }

        val auth = authService ?: return AiResult.NotConnected
        var token = auth.idToken() ?: return AiResult.NotConnected
        var drillId = drillFor(sessionId, forceNew = false)

        // One retry each for the two recoverable refusals: a stale token, and a drill that ran out.
        repeat(2) {
            when (val r = workerApi.turn(token, drillId, messages, expectJson)) {
                is WorkerApi.TurnResult.Success -> return AiResult.Success(r.content)
                is WorkerApi.TurnResult.Error -> return AiResult.Error(r.message)
                WorkerApi.TurnResult.DrillLimit -> {
                    billing.refresh()
                    return AiResult.OutOfDrills
                }
                // An expired drill is a new sitting; it spends a new drill, which is fair.
                WorkerApi.TurnResult.DrillEnded -> drillId = drillFor(sessionId, forceNew = true)
                WorkerApi.TurnResult.Unauthenticated -> token = auth.idToken(forceRefresh = true) ?: return AiResult.NotConnected
            }
        }
        return AiResult.Error("Couldn't start the case. Please try again.")
    }

    /**
     * The drill id for a session, persisted so leaving and re-opening the same session doesn't
     * spend a second drill. Only the latest session's id is kept — an older session re-opened
     * later gets a new one, which is a new sitting.
     */
    private suspend fun drillFor(sessionId: String, forceNew: Boolean): String {
        if (!forceNew) {
            preferences.activeHostedDrill.first()?.let { (activeSession, drillId) ->
                if (activeSession == sessionId) return drillId
            }
        }
        // The Worker accepts [A-Za-z0-9_-]{1,64}.
        val drillId = randomId().filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(64)
        preferences.setActiveHostedDrill(sessionId, drillId)
        return drillId
    }
}
