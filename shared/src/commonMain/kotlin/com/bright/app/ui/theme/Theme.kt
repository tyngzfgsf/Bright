package com.bright.app.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = LightOnBackground,
    onPrimary = LightBackground,
    secondary = LightOnBackground,
    onSecondary = LightBackground,
    tertiary = LightOnBackground,
    onTertiary = LightBackground,
    background = LightBackground,
    onBackground = LightOnBackground,
    surface = LightSurface,
    onSurface = LightOnBackground,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceMuted,
    outline = LightBorder,
    inverseSurface = LightInverse,
    inverseOnSurface = LightOnInverse,
    error = EmphasisLight,
    onError = LightBackground
)

private val DarkColors = darkColorScheme(
    primary = DarkOnBackground,
    onPrimary = DarkBackground,
    secondary = DarkOnBackground,
    onSecondary = DarkBackground,
    tertiary = DarkOnBackground,
    onTertiary = DarkBackground,
    background = DarkBackground,
    onBackground = DarkOnBackground,
    surface = DarkSurface,
    onSurface = DarkOnBackground,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceMuted,
    outline = DarkBorder,
    inverseSurface = DarkInverse,
    inverseOnSurface = DarkOnInverse,
    error = EmphasisDark,
    onError = DarkBackground
)

/** Shared motion specs so every button, slider, and transition in the app feels consistent. */
object BrightMotion {
    val snappy = spring<Float>(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
    val gentle = spring<Float>(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessLow)
    val press = spring<Float>(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessHigh)
    const val FAST = 180
    const val MEDIUM = 320
    const val SLOW = 520
}

/**
 * Tints the platform's system chrome (Android's status/navigation bars) to match the theme.
 *
 * Genuinely platform-specific, and genuinely asymmetric: Android needs an explicit call per
 * composition to colour its bars and set light/dark icon appearance. iOS has no equivalent —
 * status bar appearance there is driven by the hosting UIViewController, not by the Compose
 * layer — so its actual is an intentional no-op rather than a stub awaiting implementation.
 */
@Composable
internal expect fun SystemBarsEffect(darkTheme: Boolean, background: Color)

/** Whether the platform is currently in dark mode. */
@Composable
internal expect fun isSystemInDarkThemeMultiplatform(): Boolean

@Composable
fun BrightTheme(
    darkTheme: Boolean = isSystemInDarkThemeMultiplatform(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors

    // Passing the colour explicitly rather than reading MaterialTheme.colorScheme inside the
    // effect: this call sits outside the MaterialTheme block below, so the ambient scheme there
    // is still Material's default, not ours.
    SystemBarsEffect(darkTheme, colorScheme.background)

    MaterialTheme(
        colorScheme = colorScheme,
        typography = BrightTypography,
        content = content
    )
}
