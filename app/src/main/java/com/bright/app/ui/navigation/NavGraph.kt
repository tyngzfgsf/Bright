package com.bright.app.ui.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.bright.app.ui.chat.ChatScreen
import com.bright.app.ui.history.HistoryScreen
import com.bright.app.ui.home.HomeScreen
import com.bright.app.ui.onboarding.OnboardingScreen
import com.bright.app.ui.settings.SettingsScreen
import com.bright.app.ui.stats.StatsScreen
import com.bright.app.ui.theme.BrightMotion

@androidx.compose.material3.ExperimentalMaterial3Api
@Composable
fun BrightNavGraph(
    startDestination: String,
    navController: NavHostController = rememberNavController()
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        enterTransition = { fadeIn(tween(BrightMotion.MEDIUM)) + slideInHorizontally(tween(BrightMotion.MEDIUM)) { it / 6 } },
        exitTransition = { fadeOut(tween(BrightMotion.FAST)) },
        popEnterTransition = { fadeIn(tween(BrightMotion.MEDIUM)) },
        popExitTransition = { fadeOut(tween(BrightMotion.FAST)) + slideOutHorizontally(tween(BrightMotion.FAST)) { it / 6 } }
    ) {
        composable(Screen.ONBOARDING) {
            OnboardingScreen(
                onFinished = {
                    navController.navigate(Screen.HOME) {
                        popUpTo(Screen.ONBOARDING) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.HOME) {
            HomeScreen(
                onStartSession = { sessionId -> navController.navigate(Screen.chat(sessionId)) },
                onOpenHistory = { navController.navigate(Screen.HISTORY) },
                onOpenSettings = { navController.navigate(Screen.SETTINGS) },
                onOpenStats = { navController.navigate(Screen.STATS) }
            )
        }

        composable(Screen.HISTORY) {
            HistoryScreen(
                onBack = { navController.popBackStack() },
                onOpenSession = { sessionId -> navController.navigate(Screen.chat(sessionId)) }
            )
        }

        composable(Screen.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onReplayTutorial = {
                    navController.navigate(Screen.ONBOARDING) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.STATS) {
            StatsScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.CHAT,
            arguments = listOf(navArgument("sessionId") { })
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString("sessionId").orEmpty()
            ChatScreen(
                sessionId = sessionId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
