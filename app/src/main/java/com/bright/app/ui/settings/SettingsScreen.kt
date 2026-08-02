package com.bright.app.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.BrightApplication
import com.bright.app.BuildConfig
import com.bright.app.R
import com.bright.app.domain.model.Language
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightButtonStyle
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onReplayTutorial: () -> Unit
) {
    val app = LocalContext.current.applicationContext as BrightApplication
    val viewModel: SettingsViewModel = viewModel(
        factory = viewModelFactory {
            initializer { SettingsViewModel(app.database.chatDao(), app.userPreferences) }
        }
    )
    val uiState by viewModel.uiState.collectAsState()
    var apiKeyInput by remember(uiState.apiKey) { mutableStateOf(uiState.apiKey) }
    var modelInput by remember(uiState.model) { mutableStateOf(uiState.model) }
    var showClearDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            SectionLabel(stringResource(R.string.settings_section_general))
            Spacer(Modifier.height(10.dp))

            Text(stringResource(R.string.settings_language), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Language.entries.forEach { lang ->
                    SelectableChip(
                        text = lang.displayName,
                        selected = uiState.language == lang,
                        onClick = { viewModel.setLanguage(lang) }
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            Text(stringResource(R.string.settings_api_key), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            BrightTextField(
                value = apiKeyInput,
                onValueChange = { apiKeyInput = it },
                placeholder = "gsk_...",
                isPassword = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            BrightButton(
                text = stringResource(R.string.common_save),
                style = BrightButtonStyle.OUTLINED,
                onClick = { viewModel.setApiKey(apiKeyInput) },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(20.dp))
            Text(stringResource(R.string.settings_model), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            BrightTextField(
                value = modelInput,
                onValueChange = { modelInput = it },
                placeholder = "openai/gpt-oss-120b",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            BrightButton(
                text = stringResource(R.string.common_save),
                style = BrightButtonStyle.OUTLINED,
                onClick = { viewModel.setModel(modelInput) },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(28.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Spacer(Modifier.height(20.dp))

            SectionLabel(stringResource(R.string.settings_section_data))
            Spacer(Modifier.height(10.dp))
            BrightButton(
                text = stringResource(R.string.settings_clear_history),
                style = BrightButtonStyle.OUTLINED,
                onClick = { showClearDialog = true },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(28.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Spacer(Modifier.height(20.dp))

            SectionLabel(stringResource(R.string.settings_section_about))
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(stringResource(R.string.settings_version), style = MaterialTheme.typography.bodyLarge)
                Text(
                    BuildConfig.VERSION_NAME,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = {
                viewModel.resetOnboarding()
                onReplayTutorial()
            }) {
                Text(stringResource(R.string.settings_replay_tutorial))
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showClearDialog) {
        AlertDialog(
            onDismissRequest = { showClearDialog = false },
            title = { Text(stringResource(R.string.settings_clear_history)) },
            text = { Text(stringResource(R.string.settings_clear_history_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.clearAllHistory()
                    showClearDialog = false
                }) { Text(stringResource(R.string.common_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { showClearDialog = false }) { Text(stringResource(R.string.common_cancel)) }
            }
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}
