package com.bright.app.ui.navigation

object Screen {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val STATS = "stats"
    const val CHAT = "chat/{sessionId}"

    fun chat(sessionId: String) = "chat/$sessionId"
}
