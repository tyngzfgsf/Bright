package com.bright.app

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.window.ComposeUIViewController
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.bright.app.data.local.buildDatabase
import com.bright.app.data.local.getDatabaseBuilder
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqApiClient
import com.bright.app.data.remote.GroqRepository
import com.bright.app.ui.navigation.BrightNavGraph
import com.bright.app.ui.navigation.Screen
import com.bright.app.ui.theme.BrightTheme
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.first
import okio.Path.Companion.toPath
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSURL
import platform.Foundation.NSUserDomainMask
import platform.UIKit.UIViewController

private const val PREFERENCES_FILE_NAME = "bright_prefs.preferences_pb"

/**
 * iOS's equivalent of Android's `BrightApplication` + `MainActivity`: builds the dependency
 * container and hands it to the same shared navigation graph the Android app uses.
 *
 * Note there is no `appUpdater` — sideloaded APK updates are an Android-only concept, so the
 * parameter defaults to null and Settings simply doesn't render that section here.
 */
@OptIn(ExperimentalForeignApi::class)
private fun buildDependencies(): BrightDependencies {
    val documents: NSURL? = NSFileManager.defaultManager.URLForDirectory(
        directory = NSDocumentDirectory,
        inDomain = NSUserDomainMask,
        appropriateForURL = null,
        create = false,
        error = null
    )
    val documentsPath = requireNotNull(documents?.path)

    return BrightDependencies(
        database = buildDatabase(getDatabaseBuilder()),
        userPreferences = UserPreferences(
            PreferenceDataStoreFactory.createWithPath(
                produceFile = { "$documentsPath/$PREFERENCES_FILE_NAME".toPath() }
            )
        ),
        groqRepository = GroqRepository(GroqApiClient(enableLogging = false)),
        appVersionName = "1.5"
    )
}

fun MainViewController(): UIViewController = ComposeUIViewController {
    // Built once and remembered: the database and DataStore must not be recreated on
    // recomposition, exactly as `by lazy` guarantees on the Android side.
    val dependencies = remember { buildDependencies() }

    var startDestination by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        val onboardingCompleted = dependencies.userPreferences.onboardingCompleted.first()
        startDestination = if (onboardingCompleted) Screen.HOME else Screen.ONBOARDING
    }

    CompositionLocalProvider(LocalBrightDependencies provides dependencies) {
        BrightTheme {
            // Nothing is drawn until the start destination is known, mirroring the Android
            // splash screen's keep-on-screen condition — otherwise the nav graph would briefly
            // start at onboarding for a returning user.
            startDestination?.let { BrightNavGraph(startDestination = it) }
        }
    }
}
