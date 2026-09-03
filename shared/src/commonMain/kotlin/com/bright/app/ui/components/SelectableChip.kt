package com.bright.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import com.bright.app.ui.theme.BrightMotion

@Composable
fun SelectableChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = MaterialTheme.colorScheme
    val haptic = LocalHapticFeedback.current
    val scale by animateFloatAsState(
        targetValue = if (selected) 1.03f else 1f,
        animationSpec = BrightMotion.snappy,
        label = "chipScale"
    )
    val background by animateColorAsState(
        targetValue = if (selected) colors.primary else colors.surface,
        animationSpec = tween(BrightMotion.FAST),
        label = "chipBg"
    )
    val contentColor by animateColorAsState(
        targetValue = if (selected) colors.onPrimary else colors.onBackground,
        animationSpec = tween(BrightMotion.FAST),
        label = "chipContent"
    )

    Text(
        text = text,
        color = contentColor,
        style = MaterialTheme.typography.labelLarge,
        modifier = modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(14.dp))
            .background(background)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {
                    // Only on an actual change of selection — re-tapping the chip that's
                    // already selected is a no-op in every caller, so a tick there would just
                    // be noise.
                    if (!selected) haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                    onClick()
                }
            )
            .padding(horizontal = 16.dp, vertical = 10.dp)
    )
}
