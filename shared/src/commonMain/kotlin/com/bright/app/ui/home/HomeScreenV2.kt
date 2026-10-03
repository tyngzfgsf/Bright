package com.bright.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.LocalBrightDependencies
import com.bright.app.domain.SkillProfile
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import com.bright.app.domain.model.stringRes
import com.bright.app.domain.model.triageLevel
import com.bright.app.resources.*
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightDiscreteSlider
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip
import com.bright.app.ui.theme.BrightMotion
import com.bright.app.util.toScoreString
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource

/*
 * HomeScreenV2 — an alternative Home, drop-in compatible with [HomeScreen] (same parameters,
 * same [HomeViewModel]). To try it, change one line in NavGraph.kt: HomeScreen( -> HomeScreenV2(.
 *
 * Design intent (monochrome, per the app theme):
 *  - ONE obvious next action. A hero card answers "what should I do right now?" — review what's
 *    due, else drill the weak spot, else a plain welcome. Everything else is secondary.
 *  - Scenario picking is the second layer: a labelled section with a live triage badge.
 *  - Setup (role / AI role / difficulty) stays collapsed behind a one-line summary.
 *  - The pinned bottom bar always names what "Start" will start, so the CTA is never ambiguous.
 *  - All tap targets >= 48dp, icons are vector (no emoji), state is not conveyed by colour alone.
 *
 * The first-run tour overlay is intentionally not wired into this variant.
 */

@Composable
private fun scenarioLabel(scenario: ScenarioType) = stringResource(scenario.stringRes)

@Composable
private fun roleLabel(role: TraineeRole) = stringResource(role.stringRes)

@Composable
private fun aiRoleLabel(role: AiCharacterRole) = stringResource(role.stringRes)

@Composable
private fun StreakPill(days: Int) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .border(BorderStroke(1.dp, colors.outline), CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Filled.LocalFireDepartment,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = colors.onBackground
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = stringResource(Res.string.home_streak_days, days),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = colors.onBackground
        )
    }
}

/** Inverse-coloured hero card: the single most useful thing to do next. */
@Composable
private fun HeroCard(
    eyebrow: String,
    title: String,
    trailing: String?,
    actionLabel: String,
    enabled: Boolean,
    onAction: () -> Unit
) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(colors.onBackground)
            .padding(24.dp)
    ) {
        Text(
            text = eyebrow.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = colors.background.copy(alpha = 0.7f)
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = colors.background,
                modifier = Modifier.weight(1f, fill = false)
            )
            if (trailing != null) {
                Spacer(Modifier.width(12.dp))
                Text(
                    text = trailing,
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.background.copy(alpha = 0.8f)
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Box(
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clip(CircleShape)
                .background(colors.background)
                .clickable(enabled = enabled, role = Role.Button, onClick = onAction)
                .padding(horizontal = 24.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = actionLabel,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = colors.onBackground
            )
        }
    }
}

@Composable
private fun WelcomeCard() {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(colors.surfaceVariant)
            .padding(24.dp)
    ) {
        Text(
            text = stringResource(Res.string.home_greeting),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = colors.onBackground
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(Res.string.home_choose_scenario),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.onSurfaceVariant
        )
    }
}

@Composable
fun HomeScreenV2(
    onStartSession: (String) -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenStats: () -> Unit
) {
    val app = LocalBrightDependencies.current
    val viewModel: HomeViewModel = viewModel(
        factory = viewModelFactory {
            initializer { HomeViewModel(app.database.chatDao(), app.userPreferences, app.appVersionName, app.appUpdater, app.notifier, app.analytics) }
        }
    )
    val uiState by viewModel.uiState.collectAsState()
    val weakestStat by viewModel.weakestStat.collectAsState()
    val streakDays by viewModel.streakDays.collectAsState()
    val dueForReview by viewModel.dueForReview.collectAsState()
    val triageSystem by viewModel.triageSystem.collectAsState()
    var isStarting by remember { mutableStateOf(false) }
    var optionsExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val colors = MaterialTheme.colorScheme

    val difficultyLabels = listOf(
        stringResource(Res.string.difficulty_beginner),
        stringResource(Res.string.difficulty_intermediate),
        stringResource(Res.string.difficulty_advanced)
    )
    val aiRoleText = if (uiState.customAiRole.isBlank()) aiRoleLabel(uiState.selectedAiRole) else uiState.customAiRole
    val optionsSummary = "${roleLabel(uiState.selectedRole)} · $aiRoleText · " +
        difficultyLabels.getOrElse(uiState.difficultyIndex) { "" } +
        (if (uiState.decompensationEnabled) " · ${stringResource(Res.string.home_decompensation_title)}" else "")
    val chevronRotation by animateFloatAsState(
        targetValue = if (optionsExpanded) 180f else 0f,
        animationSpec = tween(BrightMotion.FAST),
        label = "optionsChevron"
    )

    val selectedName = uiState.customScenario.trim().ifBlank { scenarioLabel(uiState.selectedScenario) }
    val reviewCount = dueForReview.size
    val weakest: SkillProfile.ScenarioStat? = weakestStat

    fun guarded(block: suspend () -> String?) {
        if (isStarting) return
        haptic.performHapticFeedback(HapticFeedbackType.Confirm)
        isStarting = true
        scope.launch {
            val id = block()
            isStarting = false
            id?.let(onStartSession)
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(colors.background)) {
        // --- Header ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(start = 20.dp, end = 8.dp, top = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(Res.string.home_title),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = colors.onBackground,
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = onOpenStats, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.Insights, contentDescription = stringResource(Res.string.stats_title))
            }
            IconButton(onClick = onOpenHistory, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.History, contentDescription = stringResource(Res.string.history_title))
            }
            IconButton(onClick = onOpenSettings, modifier = Modifier.size(48.dp)) {
                BadgedBox(badge = { if (uiState.updateAvailable) Badge(containerColor = colors.onBackground) }) {
                    Icon(Icons.Filled.Settings, contentDescription = stringResource(Res.string.settings_title))
                }
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            if (streakDays > 0) {
                Spacer(Modifier.height(4.dp))
                StreakPill(streakDays)
            }
            Spacer(Modifier.height(16.dp))

            // --- Hero: review queue > weak spot > welcome ---
            when {
                reviewCount > 0 -> HeroCard(
                    eyebrow = stringResource(Res.string.stats_review_queue_title),
                    title = stringResource(Res.string.stats_review_queue_subtitle, reviewCount),
                    trailing = null,
                    actionLabel = stringResource(Res.string.home_review_now),
                    enabled = !isStarting,
                    onAction = { guarded { viewModel.startNextReviewSession() } }
                )
                weakest != null -> HeroCard(
                    eyebrow = stringResource(Res.string.home_weak_spot_label),
                    title = stringResource(weakest.type.stringRes),
                    trailing = stringResource(Res.string.home_weak_spot_avg, weakest.averageScore.toScoreString()),
                    actionLabel = stringResource(Res.string.home_weak_spot_drill),
                    enabled = !isStarting,
                    onAction = { guarded { viewModel.startWeakSpotSession(weakest.type) } }
                )
                else -> WelcomeCard()
            }

            Spacer(Modifier.height(28.dp))

            // --- Scenario picker ---
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(Res.string.home_choose_scenario),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (uiState.customScenario.isBlank()) {
                    Text(
                        text = "${triageSystem.name} · " + stringResource(
                            Res.string.home_triage_level_suffix,
                            uiState.selectedScenario.triageLevel(triageSystem)
                        ),
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ScenarioType.entries.forEach { scenario ->
                    SelectableChip(
                        text = scenarioLabel(scenario),
                        selected = uiState.customScenario.isBlank() && uiState.selectedScenario == scenario,
                        onClick = { viewModel.selectScenario(scenario) }
                    )
                }
            }
            Row(
                modifier = Modifier
                    .padding(top = 8.dp)
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(role = Role.Button) { viewModel.pickRandomScenario() }
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Shuffle, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = stringResource(Res.string.home_random_scenario),
                    style = MaterialTheme.typography.labelLarge
                )
            }
            Spacer(Modifier.height(4.dp))
            BrightTextField(
                value = uiState.customScenario,
                onValueChange = { viewModel.setCustomScenario(it) },
                placeholder = stringResource(Res.string.home_custom_scenario_hint),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(24.dp))

            // --- Collapsed setup ---
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .border(BorderStroke(1.dp, colors.outline.copy(alpha = 0.5f)), RoundedCornerShape(20.dp))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button) { optionsExpanded = !optionsExpanded }
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(Res.string.home_options_label),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = optionsSummary,
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Icon(
                        imageVector = Icons.Filled.ExpandMore,
                        contentDescription = null,
                        modifier = Modifier.rotate(chevronRotation)
                    )
                }
                AnimatedVisibility(
                    visible = optionsExpanded,
                    enter = fadeIn() + expandVertically(),
                    exit = shrinkVertically() + fadeOut()
                ) {
                    Column {
                        HorizontalDivider(color = colors.outline.copy(alpha = 0.3f))
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(stringResource(Res.string.home_choose_role), style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(10.dp))
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                TraineeRole.entries.forEach { role ->
                                    SelectableChip(
                                        text = roleLabel(role),
                                        selected = uiState.selectedRole == role,
                                        onClick = { viewModel.selectRole(role) }
                                    )
                                }
                            }

                            Spacer(Modifier.height(20.dp))
                            Text(stringResource(Res.string.home_ai_role_title), style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(10.dp))
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                AiCharacterRole.entries.forEach { role ->
                                    SelectableChip(
                                        text = aiRoleLabel(role),
                                        selected = uiState.customAiRole.isBlank() && uiState.selectedAiRole == role,
                                        onClick = { viewModel.selectAiRole(role) }
                                    )
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            BrightTextField(
                                value = uiState.customAiRole,
                                onValueChange = { viewModel.setCustomAiRole(it) },
                                placeholder = stringResource(Res.string.home_custom_ai_role_hint),
                                modifier = Modifier.fillMaxWidth()
                            )

                            Spacer(Modifier.height(20.dp))
                            BrightDiscreteSlider(
                                labels = difficultyLabels,
                                selectedIndex = uiState.difficultyIndex,
                                onIndexChange = { viewModel.setDifficultyIndex(it) }
                            )

                            Spacer(Modifier.height(20.dp))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .clickable { viewModel.setDecompensationEnabled(!uiState.decompensationEnabled) },
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                                    Text(
                                        text = stringResource(Res.string.home_decompensation_title),
                                        style = MaterialTheme.typography.titleSmall
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = stringResource(Res.string.home_decompensation_body),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = colors.onSurfaceVariant
                                    )
                                }
                                Switch(
                                    checked = uiState.decompensationEnabled,
                                    onCheckedChange = { viewModel.setDecompensationEnabled(it) }
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }

        // --- Pinned start bar: names exactly what will start ---
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.background)
                .navigationBarsPadding()
        ) {
            HorizontalDivider(color = colors.outline.copy(alpha = 0.3f))
            Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                Text(
                    text = selectedName,
                    style = MaterialTheme.typography.labelLarge,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(8.dp))
                BrightButton(
                    text = stringResource(Res.string.home_start_session),
                    loading = isStarting,
                    onClick = { guarded { viewModel.startSession() } },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
