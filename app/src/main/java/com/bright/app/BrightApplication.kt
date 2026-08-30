package com.bright.app

import android.app.Application
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.bright.app.data.local.AppDatabase
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqRepository
import okio.Path.Companion.toOkioPath

private const val PREFERENCES_FILE_NAME = "bright_prefs.preferences_pb"

class BrightApplication : Application() {

    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }

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
    val groqRepository: GroqRepository by lazy { GroqRepository() }
}
