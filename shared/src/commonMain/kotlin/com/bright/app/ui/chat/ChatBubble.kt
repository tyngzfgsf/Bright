package com.bright.app.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import org.jetbrains.compose.resources.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bright.app.resources.Res
import com.bright.app.resources.*
import com.bright.app.domain.VitalsTrend
import com.bright.app.domain.model.ChatMessage
import com.bright.app.domain.model.MessageRole
import com.bright.app.domain.model.ScoringCriterion
import com.bright.app.domain.model.textRes
import com.bright.app.ui.theme.BrightMotion
import kotlin.math.roundToInt

@Composable
fun ChatBubble(message: ChatMessage, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val isUser = message.role == MessageRole.USER
    val isUserAsk = message.role == MessageRole.USER_ASK
    val isFeedback = message.role == MessageRole.AI_FEEDBACK
    val isSummary = message.role == MessageRole.SYSTEM_SUMMARY
    val isAiAnswer = message.role == MessageRole.AI_ANSWER
    val isVitalsCheck = message.role == MessageRole.USER_VITALS_CHECK
    val isVitals = message.role == MessageRole.AI_VITALS
    val isRightAligned = isUser || isUserAsk || isVitalsCheck

    val bubbleColor = when {
        isRightAligned -> colors.primary
        isFeedback -> colors.surfaceVariant
        isSummary -> colors.surfaceVariant
        isAiAnswer -> colors.surfaceVariant
        isVitals -> colors.surfaceVariant
        else -> colors.surface // AI_QUESTION
    }
    val textColor = if (isRightAligned) colors.onPrimary else colors.onBackground
    val captionColor = if (isRightAligned) colors.onPrimary.copy(alpha = 0.7f) else colors.onSurfaceVariant

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = if (isRightAligned) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 18.dp,
                        topEnd = 18.dp,
                        bottomStart = if (isRightAligned) 18.dp else 4.dp,
                        bottomEnd = if (isRightAligned) 4.dp else 18.dp
                    )
                )
                .background(bubbleColor)
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            when {
                isFeedback -> Column {
                    if (message.score != null) {
                        var feedbackVisible by remember { mutableStateOf(false) }
                        ScoreBadge(score = message.score, onCountUpFinished = { feedbackVisible = true })
                        Spacer(Modifier.height(6.dp))
                        // Straight under the number, and not behind the feedback's fade-in: what a
                        // score was judged against is part of the score, not commentary on it.
                        ScoringBasis(
                            criterion = message.criterion,
                            uncited = message.scoreUncited,
                            textColor = textColor,
                            captionColor = captionColor
                        )
                        AnimatedVisibility(
                            visible = feedbackVisible,
                            enter = fadeIn(animationSpec = tween(BrightMotion.MEDIUM))
                        ) {
                            Text(text = message.text, color = textColor, style = MaterialTheme.typography.bodyMedium)
                        }
                    } else {
                        Text(text = message.text, color = textColor, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                isUserAsk -> Column {
                    Text(
                        text = stringResource(Res.string.chat_ask_label),
                        color = captionColor,
                        style = MaterialTheme.typography.labelMedium
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(text = message.text, color = textColor, style = MaterialTheme.typography.bodyLarge)
                }
                isAiAnswer -> Column {
                    Text(
                        text = stringResource(Res.string.chat_answer_label),
                        color = captionColor,
                        style = MaterialTheme.typography.labelMedium
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = message.text,
                        color = textColor,
                        style = MaterialTheme.typography.bodyMedium,
                        fontStyle = FontStyle.Italic
                    )
                }
                // The stored text is only the marker sent to the model; show the action instead.
                isVitalsCheck -> Text(
                    text = stringResource(Res.string.chat_vitals_checked),
                    color = textColor,
                    style = MaterialTheme.typography.labelLarge
                )
                isVitals -> Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = stringResource(Res.string.chat_vitals_label),
                            color = captionColor,
                            style = MaterialTheme.typography.labelMedium
                        )
                        message.vitalsTrend?.let { trend ->
                            Spacer(Modifier.width(8.dp))
                            VitalsTrendLabel(trend)
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(text = message.text, color = textColor, style = MaterialTheme.typography.bodyMedium)
                }
                else -> Text(
                    text = message.text,
                    color = textColor,
                    style = if (isSummary) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isSummary) FontWeight.Medium else FontWeight.Normal
                )
            }
        }
    }
}

/** Arrow plus word, so the trend never depends on color alone. Worsening takes the error color. */
@Composable
private fun VitalsTrendLabel(trend: VitalsTrend) {
    val colors = MaterialTheme.colorScheme
    val (arrow, label) = when (trend) {
        VitalsTrend.BASELINE -> "•" to Res.string.chat_vitals_trend_baseline
        VitalsTrend.IMPROVING -> "↑" to Res.string.chat_vitals_trend_improving
        VitalsTrend.UNCHANGED -> "→" to Res.string.chat_vitals_trend_unchanged
        VitalsTrend.WORSENING -> "↓" to Res.string.chat_vitals_trend_worsening
    }
    Text(
        text = "$arrow ${stringResource(label)}",
        color = if (trend == VitalsTrend.WORSENING) colors.error else colors.onBackground,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold
    )
}

@Composable
private fun ScoreBadge(score: Int, onCountUpFinished: () -> Unit = {}) {
    val colors = MaterialTheme.colorScheme
    val animatedScore = remember { Animatable(0f) }
    LaunchedEffect(score) {
        animatedScore.animateTo(score.toFloat(), animationSpec = tween(BrightMotion.SLOW))
        onCountUpFinished()
    }
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(colors.onBackground)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text = "${animatedScore.value.roundToInt()}/10",
            color = colors.background,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * "Scored against KTAS Level 2" over the criterion's own text, set off by a thin rule so it reads
 * as a citation rather than more feedback. The text always comes from the app's reference table,
 * never from the model. A score with nothing usable to cite says so instead of staying quiet —
 * that's what makes the cited ones mean something. Scores from before citations existed show
 * neither.
 */
@Composable
private fun ScoringBasis(
    criterion: ScoringCriterion?,
    uncited: Boolean,
    textColor: Color,
    captionColor: Color
) {
    when {
        criterion != null -> Row(
            modifier = Modifier
                .padding(bottom = 8.dp)
                .height(IntrinsicSize.Min)
        ) {
            Box(
                modifier = Modifier
                    .width(2.dp)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(1.dp))
                    .background(textColor.copy(alpha = 0.35f))
            )
            Spacer(Modifier.width(8.dp))
            Column {
                val standard = criterion.triageSystem?.let { system ->
                    stringResource(Res.string.chat_triage_level_source, system.name, criterion.level ?: 0)
                } ?: criterion.source.orEmpty()
                Text(
                    text = stringResource(Res.string.chat_scored_against, standard),
                    color = textColor,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = criterion.textRes?.let { stringResource(it) } ?: criterion.promptText,
                    color = captionColor,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
        uncited -> Text(
            text = stringResource(Res.string.chat_score_uncited),
            color = captionColor,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(bottom = 8.dp)
        )
    }
}

val chatBubbleEnter = fadeIn(animationSpec = tween(BrightMotion.MEDIUM)) +
    slideInVertically(animationSpec = tween(BrightMotion.MEDIUM)) { it / 4 }
