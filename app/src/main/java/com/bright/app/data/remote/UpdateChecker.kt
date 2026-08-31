package com.bright.app.data.remote

import com.bright.app.util.isNewerVersion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

object UpdateChecker {

    private const val RELEASES_URL = "https://api.github.com/repos/tyngzfgsf/Bright-app/releases/latest"

    private val json = Json { ignoreUnknownKeys = true }
    private val client = OkHttpClient()

    data class UpdateInfo(
        val versionTag: String,
        val releasePageUrl: String,
        val apkDownloadUrl: String?
    )

    suspend fun checkForUpdate(currentVersionName: String): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(RELEASES_URL)
                .header("Accept", "application/vnd.github+json")
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                val release = json.decodeFromString<GitHubRelease>(body)
                val latestVersion = release.tagName.removePrefix("v")

                if (isNewerVersion(latestVersion, currentVersionName)) {
                    val apkAsset = release.assets.firstOrNull { it.name.endsWith(".apk") }
                    UpdateInfo(
                        versionTag = release.tagName,
                        releasePageUrl = release.htmlUrl,
                        apkDownloadUrl = apkAsset?.browserDownloadUrl
                    )
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
    }
}
