package com.bright.app.ui.stats

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.BrightApplication
import com.bright.app.R
import com.bright.app.domain.SkillProfile
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(
    onBack: () -> Unit
) {
    val app = LocalContext.current.applicationContext as BrightApplication
    val viewModel: StatsViewModel = viewModel(
        factory = viewModelFactory {
            initializer { StatsViewModel(app.database.chatDao()) }
        }
    )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.stats_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        }
    ) { padding ->
        if (uiState.stats.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.stats_empty_title),
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.stats_empty_body),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 20.dp, end = 20.dp, top = 8.dp, bottom = 28.dp
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item(key = "overall") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.onBackground)
                        .padding(22.dp)
                ) {
                    Text(
                        text = stringResource(R.string.stats_overall_label),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.background.copy(alpha = 0.7f)
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            text = uiState.overallAverage?.let { String.format(Locale.US, "%.1f", it) } ?: "—",
                            style = MaterialTheme.typography.displaySmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.background
                        )
                        Text(
                            text = "/10",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.background.copy(alpha = 0.7f),
                            modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)
                        )
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = stringResource(R.string.stats_overall_answered, uiState.totalAnswered),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.background.copy(alpha = 0.7f)
                    )
                }
            }

            items(uiState.stats, key = { it.type.name }) { stat ->
                ScenarioStatRow(
                    stat = stat,
                    isWeakest = uiState.weakest?.type == stat.type
                )
            }

            item(key = "footnote") {
                Text(
                    text = stringResource(R.string.stats_threshold_note, SkillProfile.MIN_ANSWERS_FOR_JUDGMENT),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun ScenarioStatRow(
    stat: SkillProfile.ScenarioStat,
    isWeakest: Boolean
) {
    val colors = MaterialTheme.colorScheme
    var animateTarget by remember { mutableStateOf(0f) }
    val barFraction by animateFloatAsState(
        targetValue = animateTarget,
        animationSpec = tween(durationMillis = 700),
        label = "statBar"
    )
    LaunchedEffect(stat.averageScore) {
        animateTarget = (stat.averageScore / 10.0).toFloat().coerceIn(0f, 1f)
    }

    val trendText = when (stat.trend) {
        SkillProfile.Trend.IMPROVING -> stringResource(R.string.stats_trend_improving)
        SkillProfile.Trend.DECLINING -> stringResource(R.string.stats_trend_declining)
        else -> null
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colors.surface)
            .then(
                if (isWeakest) Modifier.border(1.5.dp, colors.onBackground, RoundedCornerShape(16.dp))
                else Modifier.border(1.dp, colors.outline, RoundedCornerShape(16.dp))
            )
            .padding(18.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(stat.type.stringRes),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
                if (isWeakest) {
                    Box(
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .clip(RoundedCornerShape(50))
                            .background(colors.onBackground)
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.stats_weakest_badge),
                            style = MaterialTheme.typography.labelSmall,
                            color = colors.background
                        )
                    }
                }
            }
            Text(
                text = String.format(Locale.US, "%.1f", stat.averageScore),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(Modifier.height(10.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(colors.surfaceVariant)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(barFraction)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(3.dp))
                    .background(colors.onBackground)
            )
        }

        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = stringResource(R.string.stats_answered_count, stat.answeredCount, stat.sessionCount),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant
            )
            trendText?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
