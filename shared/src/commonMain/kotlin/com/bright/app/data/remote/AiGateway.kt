package com.bright.app.data.remote

import com.bright.app.data.auth.AuthService
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.BillingResult
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.util.ApiResult
import kotlinx.coroutines.flow.first

/** What a model call came back with, as the chat screen needs to tell the cases apart. */
sealed interface AiResult {
    data class Success(val text: String) : AiResult

    /** Hosted, and the free drill allowance is spent — show the paywall. */
    data object OutOfDrills : AiResult

    /** No own key and not signed in: nothing can run a drill yet. */
    data object NotConnected : AiResult

    data class Error(val message: String) : AiResult
}

/**
 * The single place that decides how a model call is made (BACKEND_PLAN.md Phase 4):
 *
 * - **Own Groq key saved → straight to Groq**, exactly as before. Unmetered: the trainee is
 *   paying Groq themselves, so there's nothing for Bright to cap.
 * - **Otherwise, signed in → through the backend proxy**, on a metered drill ticket. The first
 *   call of a session spends one drill; every later call in that session reuses its ticket.
 *
 * BYOK wins when both are available so that existing users' setups keep behaving identically.
 */
class AiGateway(
    private val preferences: UserPreferences,
    private val groqRepository: GroqRepository,
    private val authService: AuthService?,
    private val billing: BillingRepository
) {
    suspend fun send(
        sessionId: String,
        messages: List<GroqMessage>,
        jsonMode: Boolean = false
    ): AiResult {
        val apiKey = preferences.groqApiKey.first().orEmpty()
        if (apiKey.isNotBlank()) {
            val model = preferences.groqModel.first()
            return when (val r = groqRepository.sendConversation(apiKey, model, messages, jsonMode)) {
                is ApiResult.Success -> AiResult.Success(r.data)
                is ApiResult.Error -> AiResult.Error(r.message)
            }
        }

        val auth = authService ?: return AiResult.NotConnected
        auth.idToken() ?: return AiResult.NotConnected

        // One retry: an expired/used-up ticket or a stale token are both recoverable once.
        var forceNewDrill = false
        var forceTokenRefresh = false
        repeat(2) {
            val drillId = when (val d = drillFor(sessionId, forceNew = forceNewDrill)) {
                is DrillTicket.Ok -> d.drillId
                DrillTicket.OutOfDrills -> return AiResult.OutOfDrills
                DrillTicket.SignedOut -> return AiResult.NotConnected
                is DrillTicket.Failed -> return AiResult.Error(d.message)
            }
            val token = auth.idToken(forceRefresh = forceTokenRefresh) ?: return AiResult.NotConnected
            when (val r = groqRepository.sendHostedConversation(token, drillId, messages, jsonMode)) {
                is HostedChatResult.Success -> return AiResult.Success(r.text)
                is HostedChatResult.Error -> return AiResult.Error(r.message)
                HostedChatResult.DrillRejected -> forceNewDrill = true
                HostedChatResult.Unauthenticated -> forceTokenRefresh = true
            }
        }
        return AiResult.Error("Couldn't start the drill. Please try again.")
    }

    /** True when a session would run hosted, i.e. would spend a drill. */
    suspend fun isHosted(): Boolean = billing.isHosted.first()

    private sealed interface DrillTicket {
        data class Ok(val drillId: String) : DrillTicket
        data object OutOfDrills : DrillTicket
        data object SignedOut : DrillTicket
        data class Failed(val message: String) : DrillTicket
    }

    private suspend fun drillFor(sessionId: String, forceNew: Boolean): DrillTicket {
        if (!forceNew) {
            preferences.activeHostedDrill.first()?.let { (activeSession, drillId) ->
                if (activeSession == sessionId) return DrillTicket.Ok(drillId)
            }
        }
        return when (val r = billing.startHostedDrill()) {
            is BillingResult.Success -> {
                preferences.setActiveHostedDrill(sessionId, r.data.drillId)
                DrillTicket.Ok(r.data.drillId)
            }
            BillingResult.OutOfDrills -> DrillTicket.OutOfDrills
            BillingResult.SignedOut -> DrillTicket.SignedOut
            is BillingResult.Failure -> DrillTicket.Failed(r.message)
        }
    }
}
