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
import com.bright.app.data.notify.IosNotifier
import com.bright.app.data.remote.GroqApiClient
import com.bright.app.data.remote.GroqRepository
import com.bright.app.data.share.IosImageSharer
import com.bright.app.data.update.IosAppUpdater
import com.bright.app.ui.navigation.BrightNavGraph
import com.bright.app.ui.navigation.Screen
import com.bright.app.ui.theme.BrightTheme
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.first
import okio.Path.Companion.toPath
import platform.Foundation.NSBundle
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
 * Uses `IosAppUpdater` for `appUpdater` rather than leaving it null — iOS updates through the
 * App Store rather than a sideloaded APK, but that's still an update flow, just a different
 * one. See `IosAppUpdater`'s doc comment for why it currently finds nothing to update to.
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
        imageSharer = IosImageSharer(),
        notifier = IosNotifier(),
        // Read from the bundle rather than hardcoded, so it tracks MARKETING_VERSION in the
        // Xcode project the way Android's BuildConfig.VERSION_NAME tracks the Gradle config.
        appVersionName = NSBundle.mainBundle.objectForInfoDictionaryKey(
            "CFBundleShortVersionString"
        ) as? String ?: "1.0",
        appUpdater = IosAppUpdater(),
        languageChangeRequiresRestart = true
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
