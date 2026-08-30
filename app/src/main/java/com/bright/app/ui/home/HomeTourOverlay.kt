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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.bright.app.R

/**
 * One stop on the guided tour: which captured element to spotlight, and what to say about it.
 *
 * When [manualAdvance] is false (the common case), the tour only moves on once the trainee
 * actually performs the real action on the highlighted element (tap the caller reports back via
 * its own advance callback) — the spotlight's hole lets the real touch through to the real
 * control underneath. Set it true only for a step whose "real" action would navigate away from
 * the screen the tour is running on (e.g. an icon that opens another screen); those get an
 * explicit "Next" button instead of requiring the trainee to actually leave.
 */
data class TourStep(
    val key: String,
    val titleRes: Int,
    val bodyRes: Int,
    val manualAdvance: Boolean = false
)

/**
 * A spotlight walkthrough over the real Home screen. Dims everything except the current step's
 * element (bounds captured by the Home screen via onGloballyPositioned, in window coordinates).
 *
 * Unlike a slideshow-style coach mark, the hole over the highlighted element carries no touch
 * blocker, so the trainee is tapping the *real* button/chip, not a proxy — the caller advances
 * [stepIndex] in response to that real interaction. Only steps marked [TourStep.manualAdvance]
 * get an explicit "Next" button; everything dimmed around the hole still eats touches so the
 * tour can't be broken by poking somewhere else.
 */
@Composable
fun HomeTourOverlay(
    steps: List<TourStep>,
    stepIndex: Int,
    bounds: Map<String, Rect>,
    onManualAdvance: () -> Unit,
    onSkip: () -> Unit
) {
    val step = steps.getOrNull(stepIndex) ?: return
    val targetInWindow = bounds[step.key] ?: return
    val isLast = stepIndex == steps.lastIndex

    var overlayOriginInWindow by remember { mutableStateOf(Offset.Zero) }

    val density = LocalDensity.current
    val holePad = with(density) { 8.dp.toPx() }
    val holeCorner = with(density) { 18.dp.toPx() }
    val strokeWidth = with(density) { 2.dp.toPx() }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .onGloballyPositioned { overlayOriginInWindow = it.positionInWindow() }
    ) {
        val screenW = constraints.maxWidth.toFloat()
        val screenH = constraints.maxHeight.toFloat()

        val target = targetInWindow.translate(-overlayOriginInWindow)
        val rawHole = Rect(
            left = target.left - holePad,
            top = target.top - holePad,
            right = target.right + holePad,
            bottom = target.bottom + holePad
        )
        val hole = Rect(
            left = rawHole.left.coerceIn(0f, screenW),
            top = rawHole.top.coerceIn(0f, screenH),
            right = rawHole.right.coerceIn(0f, screenW),
            bottom = rawHole.bottom.coerceIn(0f, screenH)
        )
        val targetInTopHalf = hole.center.y < screenH / 2f

        // Dim + spotlight border only — no pointer input attached, so this draws over the real
        // content without intercepting the touch that lands inside the hole.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val path = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(Rect(0f, 0f, size.width, size.height))
                addRoundRect(RoundRect(rawHole, CornerRadius(holeCorner, holeCorner)))
            }
            drawPath(path, Color.Black.copy(alpha = 0.74f))
            drawRoundRect(
                color = Color.White,
                topLeft = Offset(rawHole.left, rawHole.top),
                size = Size(rawHole.width, rawHole.height),
                cornerRadius = CornerRadius(holeCorner, holeCorner),
                style = Stroke(width = strokeWidth)
            )
        }

        // Four strips framing the hole. These DO consume touches, so the rest of the screen
        // stays locked while the tour is up — only the spotlighted element is reachable.
        TourTouchBlocker(x = 0f, y = 0f, width = screenW, height = hole.top)
        TourTouchBlocker(x = 0f, y = hole.bottom, width = screenW, height = screenH - hole.bottom)
        TourTouchBlocker(x = 0f, y = hole.top, width = hole.left, height = hole.bottom - hole.top)
        TourTouchBlocker(x = hole.right, y = hole.top, width = screenW - hole.right, height = hole.bottom - hole.top)

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
                        text = "${stepIndex + 1}/${steps.size}",
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
                                    .clickable { onSkip() }
                                    .padding(horizontal = 14.dp, vertical = 10.dp)
                            )
                        }
                        if (step.manualAdvance) {
                            Text(
                                text = stringResource(R.string.onboarding_next),
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(Color.Black)
                                    .clickable { onManualAdvance() }
                                    .padding(horizontal = 20.dp, vertical = 10.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TourTouchBlocker(x: Float, y: Float, width: Float, height: Float) {
    val density = LocalDensity.current
    if (width <= 0f || height <= 0f) return
    Box(
        modifier = Modifier
            .offset { IntOffset(x.toInt(), y.toInt()) }
            .size(with(density) { width.toDp() }, with(density) { height.toDp() })
            .pointerInput(Unit) { detectTapGestures { /* consume: dimmed area is inert */ } }
    )
}
