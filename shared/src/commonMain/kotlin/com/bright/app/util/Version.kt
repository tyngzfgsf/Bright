package com.bright.app.util

/**
 * True if [latest] is a newer dotted version than [current] (e.g. "1.6" > "1.5"). Missing
 * trailing components count as 0, so "1.6" == "1.6.0". Shared so Android's GitHub-release check
 * and iOS's App Store check compare versions identically rather than each having their own copy.
 */
fun isNewerVersion(latest: String, current: String): Boolean {
    val latestParts = latest.split(".").mapNotNull { it.toIntOrNull() }
    val currentParts = current.split(".").mapNotNull { it.toIntOrNull() }
    val maxLen = maxOf(latestParts.size, currentParts.size)
    for (i in 0 until maxLen) {
        val l = latestParts.getOrElse(i) { 0 }
        val c = currentParts.getOrElse(i) { 0 }
        if (l != c) return l > c
    }
    return false
}
