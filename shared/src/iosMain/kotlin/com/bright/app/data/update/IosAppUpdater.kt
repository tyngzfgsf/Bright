package com.bright.app.data.update

import com.bright.app.util.isNewerVersion
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import platform.Foundation.NSURL
import platform.UIKit.UIApplication

private const val BUNDLE_ID = "com.bright.app"
private const val LOOKUP_URL = "https://itunes.apple.com/lookup?bundleId=$BUNDLE_ID"

@Serializable
private data class ITunesLookupResponse(
    val resultCount: Int = 0,
    val results: List<ITunesAppInfo> = emptyList()
)

@Serializable
private data class ITunesAppInfo(
    val version: String? = null,
    val trackViewUrl: String? = null
)

/**
 * iOS has no sideloading update flow — App Review requires updates go through the App Store, so
 * there is no APK-style "download and install" here. This checks the public App Store lookup API
 * for Bright's bundle ID and, if a newer version is listed, sends the user to its App Store page;
 * the OS owns the actual install from there. [downloadAndInstall] never returns an error for a
 * failed download, because there is no download — only for the store link itself failing to open.
 *
 * Bright isn't published on the App Store yet (see IOS_MIGRATION_PLAN.md's "Known constraints" —
 * that's deliberately deferred until this phase is ready to ship). Until then, the lookup finds
 * no app under this bundle ID and simply returns null — no update section renders, rather than
 * this crashing or showing fabricated version info. It starts working the moment the app is
 * actually published under [BUNDLE_ID], with no code change needed.
 */
class IosAppUpdater : AppUpdater {

    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    override suspend fun checkForUpdate(currentVersionName: String): AppUpdateInfo? = try {
        val response: ITunesLookupResponse = client.get(LOOKUP_URL).body()
        val info = response.results.firstOrNull()
        val latestVersion = info?.version
        val storeUrl = info?.trackViewUrl
        if (latestVersion != null && storeUrl != null && isNewerVersion(latestVersion, currentVersionName)) {
            AppUpdateInfo(
                versionTag = latestVersion,
                releasePageUrl = storeUrl,
                apkDownloadUrl = null // no APK on iOS — the App Store handles installation
            )
        } else {
            null
        }
    } catch (e: Exception) {
        null
    }

    override suspend fun downloadAndInstall(info: AppUpdateInfo): String? {
        val url = NSURL.URLWithString(info.releasePageUrl)
        return if (url != null && UIApplication.sharedApplication.openURL(url)) {
            null
        } else {
            "Couldn't open the App Store."
        }
    }
}
