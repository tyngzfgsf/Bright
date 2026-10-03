package com.bright.app.data.auth

import kotlinx.coroutines.flow.Flow

/**
 * The signed-in account, reduced to the only fields any screen actually shows.
 *
 * Deliberately not Firebase's `FirebaseUser`: that type is Android-only, and letting it reach
 * `commonMain` would drag the whole Firebase SDK into the shared module for the sake of two
 * strings. [uid] is the stable identity the backend will key usage records on from Phase 3.
 */
data class AuthUser(
    val uid: String,
    val displayName: String?,
    val email: String?
)

sealed interface SignInResult {
    data object Success : SignInResult

    /**
     * The user dismissed the account picker. Distinct from [Failure] because it isn't an error
     * and must not surface an error message — backing out of a sign-in sheet is a normal thing
     * to do, especially while BYOK still works without an account.
     */
    data object Cancelled : SignInResult

    data class Failure(val message: String) : SignInResult
}

/**
 * Account sign-in, behind a shared interface for the same reason as [com.bright.app.data.update.AppUpdater]:
 * the implementation is platform-specific (Firebase Auth + Credential Manager on Android) but
 * the Settings screen that surfaces it lives in `commonMain`.
 *
 * `BrightDependencies.authService` is null on iOS for now and the UI hides the section — iOS
 * gets its own implementation when the backend phases reach it, rather than a stub pretending
 * the feature is there. See BACKEND_PLAN.md Phase 1.
 *
 * [idToken] is the one credential this interface exposes: a short-lived Firebase ID token for
 * the backend proxy (BACKEND_PLAN.md Phase 4). It's only ever sent to Bright's own functions.
 */
interface AuthService {
    /**
     * Emits the current account, or null when signed out, and re-emits on every change.
     *
     * Firebase persists the session to disk itself, so this emits the restored account on a
     * cold start with no explicit "restore" call — that's what makes sign-in survive app
     * restarts (the Phase 1 verification criterion).
     */
    val currentUser: Flow<AuthUser?>

    /** Runs the platform's account-picker flow. Safe to call while already signed in. */
    suspend fun signIn(): SignInResult

    suspend fun signOut()

    /**
     * A Firebase ID token for authenticating to Bright's backend, or null when signed out.
     * Tokens last an hour and the platform SDK refreshes them; [forceRefresh] skips the cache,
     * for retrying after the backend rejected one.
     */
    suspend fun idToken(forceRefresh: Boolean = false): String?
}
