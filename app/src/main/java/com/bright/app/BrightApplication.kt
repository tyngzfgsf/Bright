package com.bright.app

import android.app.Application
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.bright.app.data.local.AppDatabase
import com.bright.app.data.local.buildDatabase
import com.bright.app.data.local.getDatabaseBuilder
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqApiClient
import com.bright.app.data.remote.GroqRepository
import okio.Path.Companion.toOkioPath

private const val PREFERENCES_FILE_NAME = "bright_prefs.preferences_pb"

class BrightApplication : Application() {

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
            appVersionName = BuildConfig.VERSION_NAME
        )
    }
}
