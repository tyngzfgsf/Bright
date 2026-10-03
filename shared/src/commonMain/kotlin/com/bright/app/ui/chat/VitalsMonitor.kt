package com.bright.app.ui.chat

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.bright.app.domain.Consciousness
import com.bright.app.domain.PatientVitals
import com.bright.app.resources.*
import com.bright.app.ui.util.rememberReducedMotion
import org.jetbrains.compose.resources.stringResource
import kotlin.math.roundToInt

/** Long enough to read as a steady drift rather than a jump; short enough to be done before the next turn. */
private const val EASE_MILLIS = 1200

private enum class Change { NONE, UP, DOWN }

/**
 * The patient monitor, driven by the server rules engine's state and shown above the chat.
 *
 * Deliberately calm: monochrome (the theme's own surface/onSurface colors, no alarm colors), no flashing, no
 * pulsing, and no sound. Numbers ease from one value to the next; with [reducedMotion] they simply change.
 * A small arrow shows which way a value last moved, so direction never depends on color or animation.
 * Screen readers get one merged description of the whole panel instead of a dozen separate numbers.
 */
@Composable
fun VitalsMonitorPanel(
    vitals: PatientVitals,
    modifier: Modifier = Modifier,
    needsReview: Boolean = false,
    reducedMotion: Boolean = rememberReducedMotion()
) {
    val consciousnessLabel = stringResource(vitals.consciousness.labelRes())
    val description = stringResource(
        Res.string.monitor_description,
        vitals.heartRate, vitals.systolic, vitals.diastolic, vitals.spo2, vitals.respiratoryRate, consciousnessLabel
    )
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = description },
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                MonitorCell(stringResource(Res.string.monitor_hr), stringResource(Res.string.monitor_unit_hr), vitals.heartRate, reducedMotion)
                BloodPressureCell(vitals.systolic, vitals.diastolic, reducedMotion)
                MonitorCell(stringResource(Res.string.monitor_spo2), stringResource(Res.string.monitor_unit_spo2), vitals.spo2, reducedMotion)
                MonitorCell(stringResource(Res.string.monitor_rr), stringResource(Res.string.monitor_unit_rr), vitals.respiratoryRate, reducedMotion)
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    text = consciousnessLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(Res.string.monitor_elapsed, vitals.clockText),
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (needsReview) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(Res.string.monitor_needs_review),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/** Eases a displayed integer toward [target]; snaps instead when motion is reduced. */
@Composable
private fun animatedInt(target: Int, reducedMotion: Boolean): Int {
    val value by animateFloatAsState(
        targetValue = target.toFloat(),
        animationSpec = if (reducedMotion) snap() else tween(durationMillis = EASE_MILLIS, easing = FastOutSlowInEasing),
        label = "vital"
    )
    return value.roundToInt()
}

/** Which way [target] last moved. Not an animation: it is a static glyph, so it also works with reduced motion. */
@Composable
private fun rememberChange(target: Int): Change {
    var previous by remember { mutableIntStateOf(target) }
    var change by remember { mutableStateOf(Change.NONE) }
    LaunchedEffect(target) {
        if (target != previous) {
            change = if (target > previous) Change.UP else Change.DOWN
            previous = target
        }
    }
    return change
}

@Composable
private fun MonitorCell(label: String, unit: String, value: Int, reducedMotion: Boolean) {
    CellFrame(label, unit, rememberChange(value)) {
        Text(text = animatedInt(value, reducedMotion).toString(), style = valueStyle(), fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun BloodPressureCell(systolic: Int, diastolic: Int, reducedMotion: Boolean) {
    CellFrame(stringResource(Res.string.monitor_bp), stringResource(Res.string.monitor_unit_bp), rememberChange(systolic)) {
        Text(
            text = "${animatedInt(systolic, reducedMotion)}/${animatedInt(diastolic, reducedMotion)}",
            style = valueStyle(),
            fontFamily = FontFamily.Monospace // fixed-width digits: the layout never jitters while a number eases
        )
    }
}

@Composable
private fun valueStyle() = MaterialTheme.typography.headlineSmall

@Composable
private fun CellFrame(label: String, unit: String, change: Change, value: @Composable () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            value()
            Text(
                text = when (change) {
                    Change.UP -> "▲"
                    Change.DOWN -> "▼"
                    Change.NONE -> " "
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Start,
                modifier = Modifier.padding(start = 2.dp)
            )
        }
        Text(unit, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun Consciousness.labelRes() = when (this) {
    Consciousness.ALERT -> Res.string.monitor_consciousness_alert
    Consciousness.VERBAL -> Res.string.monitor_consciousness_verbal
    Consciousness.PAIN -> Res.string.monitor_consciousness_pain
    Consciousness.UNRESPONSIVE -> Res.string.monitor_consciousness_unresponsive
}
