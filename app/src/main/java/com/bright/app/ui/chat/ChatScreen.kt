package com.bright.app.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.BrightApplication
import com.bright.app.R
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    sessionId: String,
    onBack: () -> Unit
) {
    val app = LocalContext.current.applicationContext as BrightApplication
    val viewModel: ChatViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                ChatViewModel(sessionId, app.database.chatDao(), app.userPreferences, app.groqRepository)
            }
        }
    )

    val uiState by viewModel.uiState.collectAsState()
    var input by remember { mutableStateOf("") }
    var showEndDialog by remember { mutableStateOf(false) }
    var isAskMode by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(uiState.messages.size, uiState.isSending) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem((uiState.messages.size - 1).coerceAtLeast(0))
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium)
                        uiState.averageScore?.let { avg ->
                            Text(
                                text = stringResource(R.string.chat_average_score, avg),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
                actions = {
                    if (!uiState.isCompleted) {
                        IconButton(
                            onClick = { viewModel.shuffleScenario() },
                            enabled = !uiState.isSending
                        ) {
                            Icon(Icons.Filled.Shuffle, contentDescription = stringResource(R.string.chat_shuffle_scenario))
                        }
                        TextButton(onClick = { showEndDialog = true }) {
                            Text(stringResource(R.string.chat_end_session))
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
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(vertical = 12.dp)
            ) {
                itemsIndexed(uiState.messages, key = { _, m -> m.id }) { _, message ->
                    ChatBubble(message = message)
                }
                if (uiState.isSending) {
                    item(key = "typing") { TypingIndicator() }
                }
            }

            uiState.errorMessage?.let { error ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f)
                    )
                    TextButton(onClick = { viewModel.retry() }) {
                        Text(stringResource(R.string.chat_retry))
                    }
                }
            }

            if (!uiState.isCompleted) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .imePadding()
                        .navigationBarsPadding()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SelectableChip(
                        text = stringResource(R.string.chat_ask_toggle),
                        selected = isAskMode,
                        onClick = { isAskMode = !isAskMode }
                    )
                    Box(modifier = Modifier.padding(start = 8.dp).weight(1f)) {
                        BrightTextField(
                            value = input,
                            onValueChange = { input = it },
                            placeholder = stringResource(
                                if (isAskMode) R.string.chat_ask_placeholder else R.string.chat_input_placeholder
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    Box(modifier = Modifier.padding(start = 8.dp)) {
                        IconButton(
                            enabled = input.isNotBlank() && !uiState.isSending,
                            onClick = {
                                if (isAskMode) {
                                    viewModel.askQuestion(input)
                                    isAskMode = false
                                } else {
                                    viewModel.sendMessage(input)
                                }
                                input = ""
                            }
                        ) {
                            if (uiState.isSending) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(
                                    Icons.Filled.Send,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onBackground
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showEndDialog) {
        AlertDialog(
            onDismissRequest = { showEndDialog = false },
            title = { Text(stringResource(R.string.chat_end_session_confirm_title)) },
            text = { Text(stringResource(R.string.chat_end_session_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    showEndDialog = false
                    viewModel.endSession()
                }) { Text(stringResource(R.string.chat_end_session_confirm_yes)) }
            },
            dismissButton = {
                TextButton(onClick = { showEndDialog = false }) {
                    Text(stringResource(R.string.chat_end_session_confirm_cancel))
                }
            }
        )
    }
}
