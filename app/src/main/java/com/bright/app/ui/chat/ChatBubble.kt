package com.bright.app.ui.chat

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bright.app.R
import com.bright.app.domain.model.ChatMessage
import com.bright.app.domain.model.MessageRole
import com.bright.app.ui.theme.BrightMotion

@Composable
fun ChatBubble(message: ChatMessage, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val isUser = message.role == MessageRole.USER
    val isUserAsk = message.role == MessageRole.USER_ASK
    val isFeedback = message.role == MessageRole.AI_FEEDBACK
    val isSummary = message.role == MessageRole.SYSTEM_SUMMARY
    val isAiAnswer = message.role == MessageRole.AI_ANSWER
    val isRightAligned = isUser || isUserAsk

    val bubbleColor = when {
        isRightAligned -> colors.primary
        isFeedback -> colors.surfaceVariant
        isSummary -> colors.surfaceVariant
        isAiAnswer -> colors.surfaceVariant
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
                        ScoreBadge(score = message.score)
                        Spacer(Modifier.height(6.dp))
                    }
                    Text(text = message.text, color = textColor, style = MaterialTheme.typography.bodyMedium)
                }
                isUserAsk -> Column {
                    Text(
                        text = stringResource(R.string.chat_ask_label),
                        color = captionColor,
                        style = MaterialTheme.typography.labelMedium
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(text = message.text, color = textColor, style = MaterialTheme.typography.bodyLarge)
                }
                isAiAnswer -> Column {
                    Text(
                        text = stringResource(R.string.chat_answer_label),
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

@Composable
private fun ScoreBadge(score: Int) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(colors.onBackground)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text = "$score/10",
            color = colors.background,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold
        )
    }
}

val chatBubbleEnter = fadeIn(animationSpec = tween(BrightMotion.MEDIUM)) +
    slideInVertically(animationSpec = tween(BrightMotion.MEDIUM)) { it / 4 }
