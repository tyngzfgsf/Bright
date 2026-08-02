package com.bright.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.bright.app.ui.theme.BrightMotion

/**
 * A single, opinionated button style shared by the whole app: filled monochrome, subtly scales
 * down on press for a soft tactile feel, no color variants — only filled vs outlined vs text.
 */
enum class BrightButtonStyle { FILLED, OUTLINED, TEXT }

@Composable
fun BrightButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: BrightButtonStyle = BrightButtonStyle.FILLED,
    enabled: Boolean = true,
    loading: Boolean = false
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = BrightMotion.press,
        label = "buttonScale"
    )

    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(16.dp)

    when (style) {
        BrightButtonStyle.FILLED -> androidx.compose.material3.Button(
            onClick = onClick,
            modifier = modifier.height(56.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            enabled = enabled && !loading,
            shape = shape,
            interactionSource = interactionSource,
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = colors.primary,
                contentColor = colors.onPrimary,
                disabledContainerColor = colors.surfaceVariant,
                disabledContentColor = colors.onSurfaceVariant
            ),
            contentPadding = PaddingValues(horizontal = 24.dp)
        ) { ButtonContent(text, loading, colors.onPrimary) }

        BrightButtonStyle.OUTLINED -> androidx.compose.material3.OutlinedButton(
            onClick = onClick,
            modifier = modifier.height(56.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            enabled = enabled && !loading,
            shape = shape,
            interactionSource = interactionSource,
            border = BorderStroke(1.dp, colors.outline),
            colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                contentColor = colors.onBackground
            ),
            contentPadding = PaddingValues(horizontal = 24.dp)
        ) { ButtonContent(text, loading, colors.onBackground) }

        BrightButtonStyle.TEXT -> androidx.compose.material3.TextButton(
            onClick = onClick,
            modifier = modifier.height(48.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            enabled = enabled && !loading,
            interactionSource = interactionSource,
            colors = androidx.compose.material3.ButtonDefaults.textButtonColors(
                contentColor = colors.onSurfaceVariant
            )
        ) { ButtonContent(text, loading, colors.onSurfaceVariant) }
    }
}

@Composable
private fun ButtonContent(text: String, loading: Boolean, contentColor: androidx.compose.ui.graphics.Color) {
    if (loading) {
        CircularProgressIndicator(
            modifier = Modifier.height(20.dp),
            strokeWidth = 2.dp,
            color = contentColor
        )
    } else {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}
