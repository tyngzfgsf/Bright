package com.bright.app.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bright.app.R

/** One stop on the guided tour: which captured element to spotlight, and what to say about it. */
data class TourStep(val key: String, val titleRes: Int, val bodyRes: Int)

/**
 * A spotlight walkthrough over the real Home screen. Dims everything except the current
 * step's element (bounds captured by the Home screen via onGloballyPositioned), with a
 * tooltip card explaining it. Consumes all touches so the tour can't be broken mid-way —
 * navigation is via its own Next/Skip controls only.
 */
@Composable
fun HomeTourOverlay(
    steps: List<TourStep>,
    bounds: Map<String, Rect>,
    onFinish: () -> Unit
) {
    val visibleSteps = steps.filter { bounds.containsKey(it.key) }
    if (visibleSteps.isEmpty()) return

    var stepIndex by remember { mutableStateOf(0) }
    val safeIndex = stepIndex.coerceIn(0, visibleSteps.lastIndex)
    val step = visibleSteps[safeIndex]
    val target = bounds[step.key] ?: return
    val isLast = safeIndex == visibleSteps.lastIndex

    val density = LocalDensity.current
    val holePad = with(density) { 8.dp.toPx() }
    val holeCorner = with(density) { 18.dp.toPx() }
    val strokeWidth = with(density) { 2.dp.toPx() }

    val hole = Rect(
        left = target.left - holePad,
        top = target.top - holePad,
        right = target.right + holePad,
        bottom = target.bottom + holePad
    )

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) { detectTapGestures { /* consume everything */ } }
    ) {
        val screenHeightPx = constraints.maxHeight.toFloat()
        val targetInTopHalf = hole.center.y < screenHeightPx / 2f

        Canvas(modifier = Modifier.fillMaxSize()) {
            val path = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(Rect(0f, 0f, size.width, size.height))
                addRoundRect(RoundRect(hole, CornerRadius(holeCorner, holeCorner)))
            }
            drawPath(path, Color.Black.copy(alpha = 0.74f))
            drawRoundRect(
                color = Color.White,
                topLeft = Offset(hole.left, hole.top),
                size = Size(hole.width, hole.height),
                cornerRadius = CornerRadius(holeCorner, holeCorner),
                style = Stroke(width = strokeWidth)
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            contentAlignment = if (targetInTopHalf) Alignment.BottomCenter else Alignment.TopCenter
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White)
                    .padding(22.dp)
            ) {
                Text(
                    text = stringResource(step.titleRes),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.Black
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(step.bodyRes),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Black.copy(alpha = 0.65f)
                )
                Spacer(Modifier.height(18.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${safeIndex + 1}/${visibleSteps.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.Black.copy(alpha = 0.45f)
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!isLast) {
                            Text(
                                text = stringResource(R.string.tour_skip),
                                style = MaterialTheme.typography.labelLarge,
                                color = Color.Black.copy(alpha = 0.5f),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .clickable { onFinish() }
                                    .padding(horizontal = 14.dp, vertical = 10.dp)
                            )
                        }
                        Text(
                            text = stringResource(
                                if (isLast) R.string.common_done else R.string.onboarding_next
                            ),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(Color.Black)
                                .clickable {
                                    if (isLast) onFinish() else stepIndex = safeIndex + 1
                                }
                                .padding(horizontal = 20.dp, vertical = 10.dp)
                        )
                    }
                }
            }
        }
    }
}
