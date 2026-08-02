package com.bright.app.ui.theme

import androidx.compose.ui.graphics.Color

// Pure monochrome palette. No accent hues — depth comes from opacity and elevation, not color.

// Light mode
val LightBackground = Color(0xFFFFFFFF)
val LightSurface = Color(0xFFF6F6F6)
val LightSurfaceVariant = Color(0xFFEDEDED)
val LightOnBackground = Color(0xFF0A0A0A)
val LightOnSurfaceMuted = Color(0xFF6B6B6B)
val LightBorder = Color(0xFFE0E0E0)
val LightInverse = Color(0xFF0A0A0A)
val LightOnInverse = Color(0xFFFFFFFF)

// Dark mode
val DarkBackground = Color(0xFF000000)
val DarkSurface = Color(0xFF121212)
val DarkSurfaceVariant = Color(0xFF1E1E1E)
val DarkOnBackground = Color(0xFFF5F5F5)
val DarkOnSurfaceMuted = Color(0xFF9A9A9A)
val DarkBorder = Color(0xFF2A2A2A)
val DarkInverse = Color(0xFFF5F5F5)
val DarkOnInverse = Color(0xFF000000)

// Emphasis / destructive states are expressed with weight and an icon, never a hue —
// the palette stays strictly black/white/gray in both modes.
val EmphasisLight = Color(0xFF0A0A0A)
val EmphasisDark = Color(0xFFF5F5F5)
