package com.bright.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign

/**
 * A labeled, discrete-step slider. Snaps to one of [labels] and animates the label swap —
 * used for things like difficulty selection where free-floating values don't make sense.
 */
@Composable
fun BrightDiscreteSlider(
    labels: List<String>,
    selectedIndex: Int,
    onIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = MaterialTheme.colorScheme
    Column(modifier = modifier.fillMaxWidth()) {
        AnimatedContent(
            targetState = selectedIndex,
            transitionSpec = {
                (slideInVertically { h -> h / 2 } + fadeIn()) togetherWith
                    (slideOutVertically { h -> -h / 2 } + fadeOut())
            },
            label = "sliderLabel"
        ) { index ->
            Text(
                text = labels.getOrElse(index) { "" },
                style = MaterialTheme.typography.titleMedium,
                color = colors.onBackground,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Slider(
            value = selectedIndex.toFloat(),
            onValueChange = { onIndexChange(it.toInt()) },
            valueRange = 0f..(labels.size - 1).toFloat(),
            steps = (labels.size - 2).coerceAtLeast(0),
            colors = SliderDefaults.colors(
                thumbColor = colors.onBackground,
                activeTrackColor = colors.onBackground,
                inactiveTrackColor = colors.surfaceVariant,
                activeTickColor = colors.background,
                inactiveTickColor = colors.onSurfaceVariant
            )
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            labels.forEachIndexed { i, label ->
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (i == selectedIndex) colors.onBackground else colors.onSurfaceVariant
                )
            }
        }
    }
}
