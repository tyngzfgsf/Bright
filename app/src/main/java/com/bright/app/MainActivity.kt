package com.bright.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.bright.app.ui.navigation.BrightNavGraph
import com.bright.app.ui.navigation.Screen
import com.bright.app.ui.theme.BrightTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Extends AppCompatActivity (rather than a plain ComponentActivity) so that
 * AppCompatDelegate.setApplicationLocales() reliably recreates this activity with the new
 * locale on every supported API level, not just Android 13+.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        var isReady = false
        var startDestination = Screen.ONBOARDING
        splashScreen.setKeepOnScreenCondition { !isReady }

        val app = application as BrightApplication
        lifecycleScope.launch {
            val onboardingCompleted = app.userPreferences.onboardingCompleted.first()
            startDestination = if (onboardingCompleted) Screen.HOME else Screen.ONBOARDING
            isReady = true

            setContent {
                BrightTheme {
                    BrightNavGraph(startDestination = startDestination)
                }
            }
        }
    }
}
