package com.bright.app.ui.billing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.Pricing
import com.bright.app.resources.*
import org.jetbrains.compose.resources.stringResource

/**
 * The soft upgrade prompt: shown when a hosted free trainee is near or at the monthly cap.
 * Renders nothing otherwise — callers can drop it in unconditionally.
 *
 * Soft on purpose. The hard prompt (the paywall itself) only appears when an action actually
 * can't proceed; this one just makes the limit visible before it bites.
 */
@Composable
fun DrillLimitNudge(
    entitlement: Entitlement,
    isHosted: Boolean,
    onGoUnlimited: () -> Unit,
    modifier: Modifier = Modifier,
    /** Home shows usage all month ("7 of 10 left"); Chat only near the end. */
    showWhenPlenty: Boolean = false
) {
    if (!isHosted || entitlement.hasPaidAccess) return
    val remaining = entitlement.drillsRemaining ?: return
    val near = entitlement.isNearDrillLimit
    val out = entitlement.isOutOfDrills
    if (!near && !out && !showWhenPlenty) return

    val colors = MaterialTheme.colorScheme
    val text = when {
        out -> stringResource(Res.string.nudge_out_of_drills)
        near -> stringResource(Res.string.nudge_drills_left, remaining)
        else -> stringResource(
            Res.string.home_free_drills_left,
            remaining,
            entitlement.drillsLimit ?: Pricing.FREE_DRILLS_PER_MONTH
        )
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surfaceVariant)
            .padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (near || out) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(8.dp))
        TextButton(onClick = onGoUnlimited) {
            Text(stringResource(Res.string.nudge_go_unlimited), fontWeight = FontWeight.SemiBold)
        }
    }
}
