package com.bright.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.BrightApplication
import com.bright.app.BuildConfig
import com.bright.app.R
import com.bright.app.domain.model.AiCharacterRole
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.TraineeRole
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightDiscreteSlider
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
private fun scenarioLabel(scenario: ScenarioType) = stringResource(scenario.stringRes)

@Composable
private fun roleLabel(role: TraineeRole) = stringResource(role.stringRes)

@Composable
private fun aiRoleLabel(role: AiCharacterRole) = stringResource(role.stringRes)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onStartSession: (String) -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenStats: () -> Unit
) {
    val app = LocalContext.current.applicationContext as BrightApplication
    val viewModel: HomeViewModel = viewModel(
        factory = viewModelFactory {
            initializer { HomeViewModel(app.database.chatDao(), app.userPreferences, BuildConfig.VERSION_NAME) }
        }
    )
    val uiState by viewModel.uiState.collectAsState()
    val weakestStat by viewModel.weakestStat.collectAsState()
    var isStarting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val difficultyDisplayLabels = listOf("Beginner", "Intermediate", "Advanced")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineMedium) },
                actions = {
                    IconButton(onClick = onOpenStats) {
                        Icon(Icons.Filled.Insights, contentDescription = stringResource(R.string.stats_title))
                    }
                    IconButton(onClick = onOpenHistory) {
                        Icon(Icons.Filled.History, contentDescription = stringResource(R.string.history_title))
                    }
                    IconButton(onClick = onOpenSettings) {
                        BadgedBox(
                            badge = {
                                if (uiState.updateAvailable) {
                                    Badge(containerColor = MaterialTheme.colorScheme.onBackground)
                                }
                            }
                        ) {
                            Icon(Icons.Filled.Settings, contentDescription = stringResource(R.string.settings_title))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            Text(
                text = stringResource(R.string.home_greeting),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // --- Weak-spot drill card ---
            AnimatedVisibility(
                visible = weakestStat != null,
                enter = fadeIn() + expandVertically()
            ) {
                weakestStat?.let { weak ->
                    Column {
                        Spacer(Modifier.height(16.dp))
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .background(MaterialTheme.colorScheme.onBackground)
                                .padding(20.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.home_weak_spot_label),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.background.copy(alpha = 0.7f)
                            )
                            Spacer(Modifier.height(4.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(weak.type.stringRes),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.background
                                )
                                Text(
                                    text = stringResource(
                                        R.string.home_weak_spot_avg,
                                        String.format(Locale.US, "%.1f", weak.averageScore)
                                    ),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.background.copy(alpha = 0.8f)
                                )
                            }
                            Spacer(Modifier.height(14.dp))
                            TextButton(
                                onClick = {
                                    if (!isStarting) {
                                        isStarting = true
                                        scope.launch {
                                            val id = viewModel.startWeakSpotSession(weak.type)
                                            isStarting = false
                                            onStartSession(id)
                                        }
                                    }
                                },
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(MaterialTheme.colorScheme.background)
                            ) {
                                Text(
                                    text = stringResource(R.string.home_weak_spot_drill),
                                    color = MaterialTheme.colorScheme.onBackground,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 8.dp)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(
                text = stringResource(R.string.home_choose_scenario),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(Modifier.height(10.dp))
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.height(260.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(vertical = 4.dp),
                userScrollEnabled = false
            ) {
                items(ScenarioType.entries) { scenario ->
                    SelectableChip(
                        text = scenarioLabel(scenario),
                        selected = uiState.customScenario.isBlank() && uiState.selectedScenario == scenario,
                        onClick = { viewModel.selectScenario(scenario) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { viewModel.pickRandomScenario() }) {
                Icon(Icons.Filled.Shuffle, contentDescription = null, modifier = Modifier.height(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.home_random_scenario))
            }

            Spacer(Modifier.height(10.dp))
            BrightTextField(
                value = uiState.customScenario,
                onValueChange = { viewModel.setCustomScenario(it) },
                placeholder = stringResource(R.string.home_custom_scenario_hint),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))
            Text(
                text = stringResource(R.string.home_choose_role),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
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
                text = stringResource(R.string.home_ai_role_title),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
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
                placeholder = stringResource(R.string.home_custom_ai_role_hint),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))
            BrightDiscreteSlider(
                labels = difficultyDisplayLabels,
                selectedIndex = uiState.difficultyIndex,
                onIndexChange = { viewModel.setDifficultyIndex(it) }
            )

            Spacer(Modifier.height(20.dp))
            BrightButton(
                text = stringResource(R.string.home_start_session),
                loading = isStarting,
                onClick = {
                    isStarting = true
                    scope.launch {
                        val id = viewModel.startSession()
                        isStarting = false
                        onStartSession(id)
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
