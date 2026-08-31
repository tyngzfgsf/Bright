package com.bright.app.data.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.bright.app.R
import com.bright.app.data.remote.ApkDownloader
import com.bright.app.data.remote.UpdateChecker

/**
 * Android's implementation of the sideloaded-update flow. All the Android-specific machinery
 * that used to sit inside SettingsViewModel — Context, the install-permission Intent,
 * ApkDownloader, and the two Android-resource error strings — lives here, which is what let
 * SettingsViewModel move to `commonMain`.
 */
class AndroidAppUpdater(context: Context) : AppUpdater {

    private val appContext = context.applicationContext

    override suspend fun checkForUpdate(currentVersionName: String): AppUpdateInfo? =
        UpdateChecker.checkForUpdate(currentVersionName)?.let {
            AppUpdateInfo(
                versionTag = it.versionTag,
                releasePageUrl = it.releasePageUrl,
                apkDownloadUrl = it.apkDownloadUrl
            )
        }

    override suspend fun downloadAndInstall(info: AppUpdateInfo): String? {
        val apkUrl = info.apkDownloadUrl
            ?: return appContext.getString(R.string.settings_update_no_apk)

        // Not an error: hand the user to the OS permission screen and let them come back.
        if (!appContext.packageManager.canRequestPackageInstalls()) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${appContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            appContext.startActivity(intent)
            return null
        }

        val file = ApkDownloader.download(appContext, apkUrl)
            ?: return appContext.getString(R.string.settings_update_download_failed)
        ApkDownloader.launchInstall(appContext, file)
        return null
    }
}
