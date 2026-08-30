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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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

/** One stop on the guided tour: which captured element to spotlight, and what to say about it. */
data class TourStep(val key: String, val titleRes: Int, val bodyRes: Int)

/**
 * A spotlight walkthrough over the real Home screen. Dims everything except the current step's
 * element (bounds captured by the Home screen, unclipped, in window coordinates).
 *
 * The hole over the highlighted element carries no touch blocker, so the trainee is tapping the
 * *real* control, not a proxy — the caller advances the step in response to that real
 * interaction. Every step also gets a Next button, so the tour is never a dead end if someone
 * would rather just read through it.
 */
@Composable
fun HomeTourOverlay(
    steps: List<TourStep>,
    stepIndex: Int,
    bounds: Map<String, Rect>,
    onNext: () -> Unit,
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
        val hole = Rect(
            left = target.left - holePad,
            top = target.top - holePad,
            right = target.right + holePad,
            bottom = target.bottom + holePad
        )

        // Clamped edges, used for laying out the tooltip and the touch blockers. The hole is
        // still *drawn* unclamped so a partially off-screen target keeps its true shape.
        val holeTop = hole.top.coerceIn(0f, screenH)
        val holeBottom = hole.bottom.coerceIn(0f, screenH)
        val holeLeft = hole.left.coerceIn(0f, screenW)
        val holeRight = hole.right.coerceIn(0f, screenW)

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

        // Four strips framing the hole. These DO consume touches, so the rest of the screen
        // stays locked while the tour is up — only the spotlighted element is reachable.
        TourTouchBlocker(x = 0f, y = 0f, width = screenW, height = holeTop)
        TourTouchBlocker(x = 0f, y = holeBottom, width = screenW, height = screenH - holeBottom)
        TourTouchBlocker(x = 0f, y = holeTop, width = holeLeft, height = holeBottom - holeTop)
        TourTouchBlocker(x = holeRight, y = holeTop, width = screenW - holeRight, height = holeBottom - holeTop)

        // Put the tooltip in whichever gap around the spotlight is larger, and constrain it to
        // that gap. Previously it was pinned to the screen's top or bottom with nothing stopping
        // it from covering the very element it describes — which is what happened on shorter
        // (e.g. Korean) layouts, where the card ended up hiding the spotlight entirely.
        val spaceAbove = holeTop
        val spaceBelow = screenH - holeBottom
        val placeBelow = spaceBelow >= spaceAbove

        // Reserve enough room for the card to stay readable. When the spotlight is tall enough
        // that neither gap fits it (the scenario card covers most of the screen), let the card
        // overlap the spotlight's edge rather than be squeezed to nothing — losing the bottom
        // strip of a highlighted card beats an unreadable tooltip or an unreachable Next button.
        val minCardPx = with(density) { 260.dp.toPx() }
        val maxInset = (screenH - minCardPx).coerceAtLeast(0f)
        val topPadPx = if (placeBelow) holeBottom.coerceAtMost(maxInset) else 0f
        val bottomPadPx = if (placeBelow) 0f else (screenH - holeTop).coerceAtMost(maxInset)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    top = with(density) { topPadPx.toDp() },
                    bottom = with(density) { bottomPadPx.toDp() }
                )
                // Keep the card clear of the status bar and the gesture pill; the scrim still
                // covers them, but the card's buttons must stay tappable.
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            contentAlignment = if (placeBelow) Alignment.TopCenter else Alignment.BottomCenter
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White)
                    .padding(18.dp)
            ) {
                // Only the text scrolls. The action row below is outside this scroll area and
                // gets laid out first, so Next/Skip stay reachable even when the gap beside the
                // spotlight is too short for the full card — otherwise the buttons end up
                // pushed off the bottom of the screen (which is exactly what happened in
                // Korean, where the body text wraps to more lines).
                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
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
                }
                Spacer(Modifier.height(14.dp))
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
                                .clickable { onNext() }
                                .padding(horizontal = 20.dp, vertical = 10.dp)
                        )
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
