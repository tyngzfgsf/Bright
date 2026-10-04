package com.bright.app.data.auth

import android.app.Activity
import android.app.Application
import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.bright.app.R
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Firebase Auth + Credential Manager, against the same `bright-34c23` project already backing
 * the companion website — so an account made on the site and one made here are the same account.
 *
 * Two things about the Google Sign-In API worth knowing before editing this:
 *
 * 1. **Credential Manager, not the old `GoogleSignInClient`/`startActivityForResult` flow.**
 *    The `com.google.android.gms.auth.api.signin` API is deprecated; Credential Manager is its
 *    replacement and is what the current Firebase docs use.
 *
 * 2. **`GetSignInWithGoogleOption`, not `GetGoogleIdOption`.** The latter is for the "one tap,
 *    if we already know you" prompt and, with `filterByAuthorizedAccounts = true`, throws
 *    [NoCredentialException] for anyone who has never signed in — exactly the first-run case
 *    this button exists for. `GetSignInWithGoogleOption` is the explicit-button flow and always
 *    shows the full account picker, which is the right behaviour behind a "Sign in" button.
 *
 * The web client ID comes from `R.string.default_web_client_id`, which the `google-services`
 * Gradle plugin generates from `app/google-services.json`. It is not a secret (it identifies the
 * project, it doesn't authenticate anyone) and is not the Groq key — that one never comes near
 * the client, in this or any later phase.
 */
class FirebaseAuthService(
    private val application: Application,
    /**
     * Supplied by [com.bright.app.BrightApplication], which tracks the foreground activity.
     *
     * Credential Manager renders a bottom sheet, so it needs an `Activity` context — passing the
     * application context throws at runtime. Threading an Activity down through the shared
     * `AuthService` interface would put an Android type in `commonMain`, so the lookup is
     * injected here instead and the interface stays platform-neutral.
     */
    private val currentActivity: () -> Activity?
) : AuthService {

    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    override val currentUser: Flow<AuthUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            trySend(firebaseAuth.currentUser?.toAuthUser())
        }
        // Fires immediately with the persisted account on registration, so a cold start emits
        // the restored session without a separate initial read.
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    override suspend fun signIn(): SignInResult {
        val activity = currentActivity()
            ?: return SignInResult.Failure(application.getString(R.string.auth_error_no_activity))

        val option = GetSignInWithGoogleOption.Builder(
            application.getString(R.string.default_web_client_id)
        ).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

        return try {
            val response = CredentialManager.create(activity).getCredential(activity, request)
            val googleCredential = GoogleIdTokenCredential.createFrom(response.credential.data)
            // The Google ID token proves who the user is to Google; exchanging it here is what
            // makes them a Firebase user with a stable uid the backend can key on later.
            val firebaseCredential = GoogleAuthProvider.getCredential(googleCredential.idToken, null)
            auth.signInWithCredential(firebaseCredential).await()
            SignInResult.Success
        } catch (e: GetCredentialCancellationException) {
            SignInResult.Cancelled
        } catch (e: NoCredentialException) {
            // No Google account on the device at all — a real, actionable state, not a crash.
            SignInResult.Failure(application.getString(R.string.auth_error_no_google_account))
        } catch (e: GetCredentialException) {
            SignInResult.Failure(e.message ?: application.getString(R.string.auth_error_generic))
        } catch (e: Exception) {
            // The Firebase exchange itself failing (network, disabled provider, clock skew).
            SignInResult.Failure(e.message ?: application.getString(R.string.auth_error_generic))
        }
    }

    override suspend fun idToken(forceRefresh: Boolean): String? {
        val user = auth.currentUser ?: return null
        return runCatching { user.getIdToken(forceRefresh).await().token }.getOrNull()
    }

    override suspend fun signOut() {
        auth.signOut()
        // Also clear Credential Manager's own state, otherwise the next sign-in silently reuses
        // the last account instead of showing the picker — which looks like sign-out failed.
        runCatching {
            val context: Context = currentActivity() ?: application
            CredentialManager.create(context)
                .clearCredentialState(androidx.credentials.ClearCredentialStateRequest())
        }
    }
}

private fun FirebaseUser.toAuthUser() = AuthUser(
    uid = uid,
    displayName = displayName,
    email = email
)
