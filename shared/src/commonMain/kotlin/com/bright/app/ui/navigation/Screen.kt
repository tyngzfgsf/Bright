package com.bright.app.ui.navigation

import com.bright.app.data.billing.PaywallReason

object Screen {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val STATS = "stats"
    const val CHAT = "chat/{sessionId}"
    const val PAYWALL = "paywall/{reason}"

    fun chat(sessionId: String) = "chat/$sessionId"
    fun paywall(reason: PaywallReason) = "paywall/${reason.name}"
}
