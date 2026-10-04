package com.bright.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import org.jetbrains.compose.resources.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.toSize
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.LocalBrightDependencies
import com.bright.app.data.billing.PaywallReason
import com.bright.app.domain.billing.Feature
import com.bright.app.ui.billing.DrillLimitNudge
import com.bright.app.resources.Res
import com.bright.app.util.toScoreString
import com.bright.app.resources.*
import com.bright.app.domain.SkillProfile
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import com.bright.app.domain.model.stringRes
import com.bright.app.domain.model.triageLevel
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightDiscreteSlider
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip
import com.bright.app.ui.theme.BrightMotion
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

private val TOUR_STEPS = listOf(
    TourStep("scenario", Res.string.tour_scenario_title, Res.string.tour_scenario_body),
    TourStep("options", Res.string.tour_options_title, Res.string.tour_options_body),
    TourStep("insights", Res.string.tour_insights_title, Res.string.tour_insights_body),
    TourStep("start", Res.string.tour_start_title, Res.string.tour_start_body)
)

/**
 * How much vertical space Home's spacing can give back, roomy (fit = 0) to tightest (fit = 1),
 * summed over the gaps and paddings that use [lerp] below. It only steers how fast the fit
 * converges, so it needn't be exact.
 */
private const val FIT_RANGE_DP = 100f

/**
 * Unclipped bounds in window coordinates.
 *
 * Deliberately *not* `boundsInWindow()`, which clips to the visible window: an element scrolled
 * off-screen reports an empty rect there, which collapsed the tour's spotlight to nothing and
 * fed garbage into the auto-scroll math (the bug where step 2/4 showed only the explanation
 * card). `positionInWindow()` stays correct even when the element is outside the viewport.
 */
private fun LayoutCoordinates.unclippedBoundsInWindow(): Rect =
    Rect(positionInWindow(), size.toSize())

@Composable
private fun scenarioLabel(scenario: ScenarioType) = stringResource(scenario.stringRes)

@Composable
private fun roleLabel(role: TraineeRole) = stringResource(role.stringRes)

@Composable
private fun aiRoleLabel(role: AiCharacterRole) = stringResource(role.stringRes)

/** The flat, subtly-tinted card used to group each part of the Home form. */
@Composable
private fun HomeSectionCard(
    modifier: Modifier = Modifier,
    contentPadding: Dp = 0.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(contentPadding),
        content = content
    )
}

/**
 * The single "your progress" card: review queue (the more specific, more actionable version
 * of the weak-spot idea) takes priority when anything is due; otherwise the weak-spot card
 * shows as before. The streak rides along at the bottom of whichever one renders — or stands
 * alone if there's a streak but neither of the others has anything to show yet.
 */
@Composable
private fun HomeProgressCard(
    dueForReviewCount: Int,
    weakest: SkillProfile.ScenarioStat?,
    streakDays: Int,
    fit: Float,
    onReviewNow: () -> Unit,
    onDrillWeakSpot: (ScenarioType) -> Unit
) {
    val colors = MaterialTheme.colorScheme
    val hasPrimaryContent = dueForReviewCount > 0 || weakest != null

    // The streak shares the label's row rather than taking a row of its own under the button —
    // that extra row is what pushed Home past one screen on ordinary phones.
    @Composable
    fun LabelRow(label: String) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = colors.background.copy(alpha = 0.7f)
            )
            if (streakDays > 0) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(colors.background.copy(alpha = 0.14f))
                        .padding(horizontal = 10.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("🔥", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = stringResource(Res.string.home_streak_days, streakDays),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.background
                    )
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(colors.onBackground)
            .padding(lerp(20.dp, 16.dp, fit))
    ) {
        when {
            dueForReviewCount > 0 -> {
                LabelRow(stringResource(Res.string.stats_review_queue_title))
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(Res.string.stats_review_queue_subtitle, dueForReviewCount),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = colors.background
                )
                Spacer(Modifier.height(lerp(14.dp, 10.dp, fit)))
                TextButton(
                    onClick = onReviewNow,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(colors.background)
                ) {
                    Text(
                        text = stringResource(Res.string.home_review_now),
                        color = colors.onBackground,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                }
            }

            weakest != null -> {
                LabelRow(stringResource(Res.string.home_weak_spot_label))
                Spacer(Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(weakest.type.stringRes),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = colors.background
                    )
                    Text(
                        text = stringResource(Res.string.home_weak_spot_avg, weakest.averageScore.toScoreString()),
                        style = MaterialTheme.typography.titleSmall,
                        color = colors.background.copy(alpha = 0.8f)
                    )
                }
                Spacer(Modifier.height(lerp(14.dp, 10.dp, fit)))
                TextButton(
                    onClick = { onDrillWeakSpot(weakest.type) },
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(colors.background)
                ) {
                    Text(
                        text = stringResource(Res.string.home_weak_spot_drill),
                        color = colors.onBackground,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                }
            }
        }

        // Streak on its own: nothing else to share a row with.
        if (streakDays > 0 && !hasPrimaryContent) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔥")
                Spacer(Modifier.width(6.dp))
                Text(
                    text = stringResource(Res.string.home_streak_days, streakDays),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.background
                )
            }
        }
    }
}

/** Stands in for a Plus-only input: looks like the field, opens the paywall when tapped. */
@Composable
private fun LockedFeatureRow(text: String, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colors.background)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.height(16.dp), tint = colors.onSurfaceVariant)
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onStartSession: (String) -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenStats: () -> Unit,
    onOpenPaywall: (PaywallReason) -> Unit = {}
) {
    val app = LocalBrightDependencies.current
    val viewModel: HomeViewModel = viewModel(
        factory = viewModelFactory {
            initializer { HomeViewModel(app.database.chatDao(), app.userPreferences, app.appVersionName, app.appUpdater, app.notifier, app.analytics, app.billing) }
        }
    )
    val uiState by viewModel.uiState.collectAsState()
    val weakestStat by viewModel.weakestStat.collectAsState()
    val streakDays by viewModel.streakDays.collectAsState()
    val dueForReview by viewModel.dueForReview.collectAsState()
    val triageSystem by viewModel.triageSystem.collectAsState()
    val entitlement by viewModel.entitlement.collectAsState()
    val isHosted by viewModel.isHosted.collectAsState()
    val canWriteCustom = entitlement.has(Feature.CUSTOM_SCENARIOS)
    var isStarting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    // These string resources existed in both languages all along but were never wired up —
    // the list was hardcoded English, so the Korean UI showed "Intermediate".
    val difficultyDisplayLabels = listOf(
        stringResource(Res.string.difficulty_beginner),
        stringResource(Res.string.difficulty_intermediate),
        stringResource(Res.string.difficulty_advanced)
    )
    var optionsExpanded by remember { mutableStateOf(false) }

    // --- Interactive home tour: highlights the real controls and waits for a real tap. ---
    val showTour by viewModel.showHomeTour.collectAsState()
    var tourStepIndex by remember { mutableStateOf(0) }
    val tourBounds = remember { mutableStateMapOf<String, Rect>() }
    var scrollColumnOrigin by remember { mutableStateOf(Offset.Zero) }
    val scrollState = rememberScrollState()
    val density = LocalDensity.current

    // Fit Home to the phone: 0 is the roomy spacing, 1 the tightest. Whenever the collapsed form
    // is taller than the space between the top bar and the Start button, spacing tightens by
    // about the overflow; when there's slack, it relaxes again. Once it's at 1 and still doesn't
    // fit (a very small screen, or a large font setting) the column simply scrolls. Expanded
    // options are meant to scroll, so the fit holds still while they're open.
    var fit by remember { mutableFloatStateOf(0f) }
    var viewportHeightPx by remember { mutableStateOf(0) }
    var contentHeightPx by remember { mutableStateOf(0) }
    LaunchedEffect(viewportHeightPx, contentHeightPx, optionsExpanded) {
        if (optionsExpanded || viewportHeightPx == 0 || contentHeightPx == 0) return@LaunchedEffect
        val overflowDp = with(density) { (contentHeightPx - viewportHeightPx).toDp().value }
        val next = (fit + overflowDp / FIT_RANGE_DP).coerceIn(0f, 1f)
        if (abs(next - fit) > 0.01f) fit = next
    }
    fun gap(roomy: Dp, tightest: Dp): Dp = lerp(roomy, tightest, fit)

    LaunchedEffect(showTour) {
        if (showTour) tourStepIndex = 0
    }

    fun advanceTourFrom(key: String) {
        if (!showTour) return
        if (TOUR_STEPS.getOrNull(tourStepIndex)?.key != key) return
        if (tourStepIndex == TOUR_STEPS.lastIndex) {
            viewModel.completeHomeTour()
        } else {
            tourStepIndex += 1
        }
    }

    // Only "scenario" and "options" live inside the scrollable column — the insights icon sits
    // in the top bar and the start button is pinned to the bottom bar, both always on-screen.
    LaunchedEffect(showTour, tourStepIndex) {
        if (!showTour) return@LaunchedEffect
        val key = TOUR_STEPS.getOrNull(tourStepIndex)?.key ?: return@LaunchedEffect
        if (key != "scenario" && key != "options") return@LaunchedEffect
        val target = snapshotFlow { tourBounds[key] }.filter { it != null }.first() ?: return@LaunchedEffect
        val contentTop = target.top - scrollColumnOrigin.y + scrollState.value
        val topMarginPx = with(density) { 96.dp.toPx() }
        val desired = (contentTop - topMarginPx).roundToInt().coerceIn(0, scrollState.maxValue)
        scrollState.animateScrollTo(desired)
    }

    val currentAiRoleLabel = if (uiState.customAiRole.isBlank()) aiRoleLabel(uiState.selectedAiRole) else uiState.customAiRole
    val optionsSummary = "${roleLabel(uiState.selectedRole)} · $currentAiRoleLabel · " +
        difficultyDisplayLabels.getOrElse(uiState.difficultyIndex) { "" }
    val chevronRotation by animateFloatAsState(
        targetValue = if (optionsExpanded) 180f else 0f,
        animationSpec = tween(BrightMotion.FAST),
        label = "optionsChevron"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(Res.string.home_title), style = MaterialTheme.typography.headlineMedium) },
                    actions = {
                        IconButton(
                            onClick = {
                                advanceTourFrom("insights")
                                onOpenStats()
                            },
                            modifier = Modifier.onGloballyPositioned { tourBounds["insights"] = it.unclippedBoundsInWindow() }
                        ) {
                            Icon(Icons.Filled.Insights, contentDescription = stringResource(Res.string.stats_title))
                        }
                        IconButton(onClick = onOpenHistory) {
                            Icon(Icons.Filled.History, contentDescription = stringResource(Res.string.history_title))
                        }
                        IconButton(onClick = onOpenSettings) {
                            BadgedBox(
                                badge = {
                                    if (uiState.updateAvailable) {
                                        Badge(containerColor = MaterialTheme.colorScheme.onBackground)
                                    }
                                }
                            ) {
                                Icon(Icons.Filled.Settings, contentDescription = stringResource(Res.string.settings_title))
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        titleContentColor = MaterialTheme.colorScheme.onBackground
                    )
                )
            },
            bottomBar = {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.background)
                        .navigationBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 16.dp)
                ) {
                    BrightButton(
                        text = stringResource(Res.string.home_start_session),
                        loading = isStarting,
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.Confirm)
                            advanceTourFrom("start")
                            // Out of hosted drills: the paywall instead of a chat that can't start.
                            if (isHosted && entitlement.isOutOfDrills) {
                                onOpenPaywall(PaywallReason.DRILL_LIMIT)
                                return@BrightButton
                            }
                            isStarting = true
                            scope.launch {
                                val id = viewModel.startSession()
                                isStarting = false
                                onStartSession(id)
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .onGloballyPositioned { tourBounds["start"] = it.unclippedBoundsInWindow() }
                    )
                }
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .onGloballyPositioned { scrollColumnOrigin = it.positionInWindow() }
                    .onSizeChanged { viewportHeightPx = it.height }
                    .verticalScroll(scrollState)
                    // After verticalScroll, so this is the content's full height, not the viewport's.
                    .onSizeChanged { contentHeightPx = it.height }
                    .padding(horizontal = 20.dp)
            ) {
                Text(
                    text = stringResource(Res.string.home_greeting),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                DrillLimitNudge(
                    entitlement = entitlement,
                    isHosted = isHosted,
                    onGoUnlimited = { onOpenPaywall(PaywallReason.DRILL_LIMIT) },
                    showWhenPlenty = true,
                    modifier = Modifier.padding(top = 12.dp)
                )

                // --- Progress card: review queue (most specific/actionable) takes priority
                // over the weak-spot card when there's anything due; the streak always rides
                // along at the bottom of whichever one shows, or stands alone if neither does. ---
                val dueForReviewCount = dueForReview.size
                AnimatedVisibility(
                    visible = dueForReviewCount > 0 || weakestStat != null || streakDays > 0,
                    enter = fadeIn() + expandVertically()
                ) {
                    Column {
                        Spacer(Modifier.height(gap(16.dp, 8.dp)))
                        HomeProgressCard(
                            dueForReviewCount = dueForReviewCount,
                            weakest = weakestStat,
                            streakDays = streakDays,
                            fit = fit,
                            onReviewNow = {
                                if (!isStarting) {
                                    haptic.performHapticFeedback(HapticFeedbackType.Confirm)
                                    isStarting = true
                                    scope.launch {
                                        val id = viewModel.startNextReviewSession()
                                        isStarting = false
                                        id?.let(onStartSession)
                                    }
                                }
                            },
                            onDrillWeakSpot = { type ->
                                if (!isStarting) {
                                    haptic.performHapticFeedback(HapticFeedbackType.Confirm)
                                    isStarting = true
                                    scope.launch {
                                        val id = viewModel.startWeakSpotSession(type)
                                        isStarting = false
                                        onStartSession(id)
                                    }
                                }
                            }
                        )
                    }
                }

                Spacer(Modifier.height(gap(20.dp, 12.dp)))

                // --- Scenario card ---
                HomeSectionCard(
                    modifier = Modifier.onGloballyPositioned { tourBounds["scenario"] = it.unclippedBoundsInWindow() },
                    contentPadding = gap(24.dp, 16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(Res.string.home_choose_scenario),
                            style = MaterialTheme.typography.titleMedium
                        )
                        if (uiState.customScenario.isBlank()) {
                            Text(
                                text = "${triageSystem.name} · " + stringResource(
                                    Res.string.home_triage_level_suffix,
                                    uiState.selectedScenario.triageLevel(triageSystem)
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Spacer(Modifier.height(gap(12.dp, 8.dp)))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalArrangement = Arrangement.spacedBy(gap(10.dp, 8.dp))
                    ) {
                        ScenarioType.entries.forEach { scenario ->
                            SelectableChip(
                                text = scenarioLabel(scenario),
                                selected = uiState.customScenario.isBlank() && uiState.selectedScenario == scenario,
                                onClick = {
                                    viewModel.selectScenario(scenario)
                                    advanceTourFrom("scenario")
                                }
                            )
                        }
                    }

                    Spacer(Modifier.height(gap(8.dp, 0.dp)))
                    TextButton(
                        onClick = {
                            viewModel.pickRandomScenario()
                            advanceTourFrom("scenario")
                        }
                    ) {
                        Icon(Icons.Filled.Shuffle, contentDescription = null, modifier = Modifier.height(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(Res.string.home_random_scenario))
                    }

                    Spacer(Modifier.height(gap(6.dp, 0.dp)))
                    if (canWriteCustom) {
                        BrightTextField(
                            value = uiState.customScenario,
                            onValueChange = { viewModel.setCustomScenario(it) },
                            placeholder = stringResource(Res.string.home_custom_scenario_hint),
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        LockedFeatureRow(
                            text = stringResource(Res.string.lock_custom_scenario),
                            onClick = { onOpenPaywall(PaywallReason.CUSTOM_SCENARIO) }
                        )
                    }
                }

                Spacer(Modifier.height(gap(14.dp, 10.dp)))

                // --- Collapsible "More options": role, AI role, difficulty. Defaults work fine,
                // so this stays tucked away until someone taps it — keeps Home from feeling like
                // a long form when most trainees just want to pick a scenario and go. ---
                HomeSectionCard(
                    modifier = Modifier.onGloballyPositioned { tourBounds["options"] = it.unclippedBoundsInWindow() }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                optionsExpanded = !optionsExpanded
                                advanceTourFrom("options")
                            }
                            .padding(horizontal = 24.dp, vertical = gap(24.dp, 16.dp)),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = stringResource(Res.string.home_options_label),
                                style = MaterialTheme.typography.titleMedium
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = optionsSummary,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                        exit = shrinkVertically() + androidx.compose.animation.fadeOut()
                    ) {
                        Column {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                            Column(modifier = Modifier.padding(24.dp)) {
                                Text(
                                    text = stringResource(Res.string.home_choose_role),
                                    style = MaterialTheme.typography.titleSmall
                                )
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
                                Text(
                                    text = stringResource(Res.string.home_ai_role_title),
                                    style = MaterialTheme.typography.titleSmall
                                )
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
                                if (canWriteCustom) {
                                    Spacer(Modifier.height(10.dp))
                                    BrightTextField(
                                        value = uiState.customAiRole,
                                        onValueChange = { viewModel.setCustomAiRole(it) },
                                        placeholder = stringResource(Res.string.home_custom_ai_role_hint),
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                }

                                Spacer(Modifier.height(20.dp))
                                BrightDiscreteSlider(
                                    labels = difficultyDisplayLabels,
                                    selectedIndex = uiState.difficultyIndex,
                                    onIndexChange = { viewModel.setDifficultyIndex(it) }
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(gap(24.dp, 12.dp)))
            }
        }

        if (showTour) {
            HomeTourOverlay(
                steps = TOUR_STEPS,
                stepIndex = tourStepIndex,
                bounds = tourBounds,
                onNext = { TOUR_STEPS.getOrNull(tourStepIndex)?.key?.let(::advanceTourFrom) },
                onSkip = { viewModel.completeHomeTour() }
            )
        }
    }
}
