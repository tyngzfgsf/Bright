package com.bright.app.data.update

data class AppUpdateInfo(
    val versionTag: String,
    val releasePageUrl: String,
    val apkDownloadUrl: String?
)

/**
 * Sideloaded-APK updates — an Android-only feature, behind a shared interface so the screens
 * that surface it can still live in `commonMain`.
 *
 * iOS has no equivalent and shouldn't: the App Store owns updates there. So
 * `BrightDependencies.appUpdater` is simply `null` on iOS and the UI hides the section, rather
 * than there being a stub implementation pretending the feature exists.
 */
interface AppUpdater {
    suspend fun checkForUpdate(currentVersionName: String): AppUpdateInfo?

    /**
     * Runs the platform's download-and-install flow.
     * @return a user-facing error message, or null if it succeeded (or handed off to the OS,
     *         e.g. by sending the user to the "allow unknown sources" settings screen).
     */
    suspend fun downloadAndInstall(info: AppUpdateInfo): String?
}
