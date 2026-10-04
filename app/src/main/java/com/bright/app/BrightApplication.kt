package com.bright.app

import android.app.Activity
import android.app.Application
import android.os.Bundle
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.bright.app.data.analytics.FirebaseAnalyticsTracker
import com.bright.app.data.auth.AuthService
import com.bright.app.data.auth.FirebaseAuthService
import com.bright.app.data.local.AppDatabase
import com.bright.app.data.local.buildDatabase
import com.bright.app.data.local.getDatabaseBuilder
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.notify.AndroidNotifier
import com.bright.app.data.notify.LocalNotifier
import com.bright.app.data.remote.GroqApiClient
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.share.AndroidImageSharer
import com.bright.app.data.share.ImageSharer
import com.bright.app.data.update.AndroidAppUpdater
import okio.Path.Companion.toOkioPath

private const val PREFERENCES_FILE_NAME = "bright_prefs.preferences_pb"

class BrightApplication : Application() {

    /**
     * The activity currently in the foreground, or null when none is.
     *
     * Only [FirebaseAuthService] needs this: Credential Manager's account picker is a bottom
     * sheet and requires an Activity context. Tracking it here — rather than passing an Activity
     * down through the shared Settings screen — keeps every Android type out of `commonMain`.
     *
     * Held as a plain reference, not a WeakReference: it is cleared in `onActivityDestroyed`,
     * so it never outlives the activity it points at.
     */
    private var foregroundActivity: Activity? = null

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                foregroundActivity = activity
            }

            override fun onActivityPaused(activity: Activity) {
                if (foregroundActivity === activity) foregroundActivity = null
            }

            override fun onActivityDestroyed(activity: Activity) {
                if (foregroundActivity === activity) foregroundActivity = null
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityStarted(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
        })
    }

    // The old AppDatabase.getInstance(context) singleton is gone — Room's KMP builder is
    // split into a platform-specific builder plus a shared build step, and `by lazy` here
    // already provides the single-instance guarantee that the synchronized block used to.
    val database: AppDatabase by lazy { buildDatabase(getDatabaseBuilder(this)) }

    // Where the store lives on disk is an Android-specific concern (files dir + java.io.File),
    // so it's decided here rather than inside the shared UserPreferences class — see the
    // comment on UserPreferences for why.
    val userPreferences: UserPreferences by lazy {
        UserPreferences(
            PreferenceDataStoreFactory.createWithPath(
                produceFile = { filesDir.resolve(PREFERENCES_FILE_NAME).toOkioPath() }
            )
        )
    }
    // BuildConfig.DEBUG-gated body logging, same as the old OkHttp/Retrofit setup had.
    val groqRepository: GroqRepository by lazy {
        GroqRepository(GroqApiClient(enableLogging = BuildConfig.DEBUG))
    }

    val imageSharer: ImageSharer by lazy { AndroidImageSharer(this) }

    val notifier: LocalNotifier by lazy { AndroidNotifier(this) }

    val authService: AuthService by lazy {
        FirebaseAuthService(this, currentActivity = { foregroundActivity })
    }

    /**
     * The platform-neutral bag the screens actually read from. Everything Android-specific
     * about building these (Context for the DB path and DataStore file, BuildConfig for the
     * version name) stays here; the screens see only [BrightDependencies].
     */
    val dependencies: BrightDependencies by lazy {
        BrightDependencies(
            database = database,
            userPreferences = userPreferences,
            groqRepository = groqRepository,
            imageSharer = imageSharer,
            notifier = notifier,
            appVersionName = BuildConfig.VERSION_NAME,
            appUpdater = AndroidAppUpdater(this),
            authService = authService,
            analytics = FirebaseAnalyticsTracker(this)
        )
    }
}
