package com.bright.app.ui.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.platform.LocalGraphicsContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bright.app.data.share.ImageSharer
import com.bright.app.resources.Res
import com.bright.app.resources.app_name
import com.bright.app.resources.app_slogan
import com.bright.app.resources.chat_share_result
import com.bright.app.resources.home_streak_days
import com.bright.app.ui.theme.BrightMotion
import com.bright.app.util.toScoreString
import com.bright.app.util.randomId
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import com.bright.app.ui.components.BrightButton

/**
 * The exported/shared image itself. Deliberately **not** driven by `MaterialTheme.colorScheme`
 * — unlike in-app UI, this card is meant to look identical wherever it lands (saved to a photo
 * library, posted, sent to a friend who's never opened Bright), so it always renders in Bright's
 * actual black/white brand look regardless of the sharer's current in-app theme, the same way
 * the app icon doesn't change with system theme.
 */
@Composable
fun ShareResultCard(
    scenarioLabel: String,
    score: Double,
    streakDays: Int,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .width(340.dp)
            .background(Color.Black)
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(Res.string.app_name),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )
        Spacer(Modifier.height(28.dp))
        Text(
            text = scenarioLabel,
            style = MaterialTheme.typography.labelLarge,
            color = Color.White.copy(alpha = 0.7f)
        )
        Spacer(Modifier.height(8.dp))
        val animatedScore = remember { Animatable(0f) }
        LaunchedEffect(score) {
            animatedScore.animateTo(score.toFloat(), animationSpec = tween(BrightMotion.SLOW))
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = animatedScore.value.toDouble().toScoreString(),
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                text = "/10",
                style = MaterialTheme.typography.titleMedium,
                color = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.padding(start = 4.dp, bottom = 10.dp)
            )
        }
        if (streakDays > 0) {
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔥")
                Spacer(Modifier.width(6.dp))
                Text(
                    text = stringResource(Res.string.home_streak_days, streakDays),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
            }
        }
        Spacer(Modifier.height(28.dp))
        Text(
            text = stringResource(Res.string.app_slogan),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.5f)
        )
    }
}

/**
 * The result card plus a Share button that captures exactly what's on screen — using
 * [LocalGraphicsContext] rather than drawing the card twice (once for display, once off-screen
 * for capture), so there's no risk of the exported image ever drifting from the preview.
 */
@Composable
fun SessionCompleteShareSection(
    scenarioLabel: String,
    score: Double,
    streakDays: Int,
    imageSharer: ImageSharer,
    modifier: Modifier = Modifier
) {
    val graphicsContext = LocalGraphicsContext.current
    val graphicsLayer = remember { graphicsContext.createGraphicsLayer() }
    DisposableEffect(Unit) {
        onDispose { graphicsContext.releaseGraphicsLayer(graphicsLayer) }
    }

    val scope = rememberCoroutineScope()
    var isSharing by remember { mutableStateOf(false) }
    var shareError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        ShareResultCard(
            scenarioLabel = scenarioLabel,
            score = score,
            streakDays = streakDays,
            modifier = Modifier.drawWithContent {
                graphicsLayer.record { this@drawWithContent.drawContent() }
                drawLayer(graphicsLayer)
            }
        )
        Spacer(Modifier.height(16.dp))
        BrightButton(
            text = stringResource(Res.string.chat_share_result),
            loading = isSharing,
            onClick = {
                if (!isSharing) {
                    isSharing = true
                    shareError = null
                    scope.launch {
                        val bitmap = graphicsLayer.toImageBitmap()
                        shareError = imageSharer.share(bitmap, "bright-result-${randomId()}.png")
                        isSharing = false
                    }
                }
            }
        )
        shareError?.let { error ->
            Spacer(Modifier.height(8.dp))
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
