package com.bright.app.ui.chat

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import org.jetbrains.compose.resources.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.bright.app.resources.Res
import com.bright.app.resources.*
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.MessageRole
import com.bright.app.util.voice.AndroidSpeechRecognitionEngine
import com.bright.app.util.voice.AndroidTextToSpeechEngine
import com.bright.app.util.voice.SpeechRecognitionEvent
import com.bright.app.util.voice.SpeechSynthesisEvent

private enum class VoiceModeState { LISTENING, PROCESSING, SPEAKING, ERROR }

@Composable
fun VoiceModeOverlay(
    viewModel: ChatViewModel,
    onExit: () -> Unit
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()

    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    val recognizer = remember { AndroidSpeechRecognitionEngine(context) }
    val recognitionAvailable = recognizer.isAvailable

    if (!hasPermission || !recognitionAvailable) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(
                        if (recognitionAvailable) Res.string.voice_mode_permission_needed else Res.string.chat_voice_unavailable
                    ),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 32.dp)
                )
                Spacer(Modifier.height(20.dp))
                TextButton(onClick = onExit) {
                    Text(stringResource(Res.string.common_back), color = Color.White)
                }
            }
        }
        return
    }

    var voiceState by remember { mutableStateOf(VoiceModeState.LISTENING) }
    var partialText by remember { mutableStateOf("") }
    var rmsLevel by remember { mutableFloatStateOf(0f) }
    var isPaused by remember { mutableStateOf(false) }

    val tts = remember { AndroidTextToSpeechEngine(context) }

    fun startListeningInternal() {
        if (isPaused || uiState.isCompleted) return
        partialText = ""
        voiceState = VoiceModeState.LISTENING
        val localeTag = if (uiState.language == Language.KOREAN) "ko-KR" else "en-US"
        recognizer.startListening(localeTag, partialResults = true)
    }

    DisposableEffect(Unit) {
        recognizer.setEventListener { event ->
            when (event) {
                is SpeechRecognitionEvent.VolumeChanged -> rmsLevel = event.level
                is SpeechRecognitionEvent.NoMatch ->
                    if (!isPaused && !uiState.isCompleted) startListeningInternal()
                is SpeechRecognitionEvent.Error -> voiceState = VoiceModeState.ERROR
                is SpeechRecognitionEvent.FinalResult -> {
                    partialText = ""
                    voiceState = VoiceModeState.PROCESSING
                    viewModel.sendMessage(event.text)
                }
                is SpeechRecognitionEvent.PartialResult -> partialText = event.text
            }
        }
        onDispose {
            recognizer.stopListening()
            recognizer.cancel()
            recognizer.destroy()
        }
    }

    DisposableEffect(Unit) {
        tts.setEventListener { event ->
            when (event) {
                SpeechSynthesisEvent.Started -> voiceState = VoiceModeState.SPEAKING
                SpeechSynthesisEvent.Done ->
                    if (!isPaused && !uiState.isCompleted) startListeningInternal()
                SpeechSynthesisEvent.Error ->
                    if (!isPaused && !uiState.isCompleted) startListeningInternal()
            }
        }
        onDispose { tts.shutdown() }
    }

    LaunchedEffect(Unit) { startListeningInternal() }

    LaunchedEffect(uiState.messages.lastOrNull()?.id) {
        val last = uiState.messages.lastOrNull()
        if (last != null && last.role != MessageRole.USER && last.text.isNotBlank()) {
            recognizer.stopListening()
            tts.speak(last.text, uiState.language, last.id)
        }
    }

    val statusText = when {
        uiState.isCompleted -> stringResource(Res.string.voice_mode_session_complete)
        isPaused -> stringResource(Res.string.voice_mode_paused)
        voiceState == VoiceModeState.LISTENING -> stringResource(Res.string.voice_mode_listening)
        voiceState == VoiceModeState.PROCESSING -> stringResource(Res.string.chat_thinking)
        voiceState == VoiceModeState.SPEAKING -> stringResource(Res.string.voice_mode_speaking)
        else -> stringResource(Res.string.voice_mode_error)
    }

    val normalizedRms = ((rmsLevel + 2f) / 12f).coerceIn(0f, 1f)
    val infiniteTransition = rememberInfiniteTransition(label = "voiceOrb")
    val idlePulse by infiniteTransition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "idlePulse"
    )
    val targetScale = when (voiceState) {
        VoiceModeState.LISTENING -> 0.9f + normalizedRms * 0.5f
        VoiceModeState.SPEAKING -> idlePulse
        VoiceModeState.PROCESSING -> idlePulse * 0.9f
        VoiceModeState.ERROR -> 0.9f
    }
    val orbScale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "orbScale"
    )

    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxSize().padding(32.dp)
        ) {
            Spacer(Modifier.weight(1f))

            Box(
                modifier = Modifier
                    .size(200.dp)
                    .graphicsLayer { scaleX = orbScale; scaleY = orbScale }
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(Color.White, Color.White.copy(alpha = 0.15f), Color.Transparent)
                        ),
                        shape = CircleShape
                    )
            )

            Spacer(Modifier.height(32.dp))
            Text(statusText, color = Color.White, style = MaterialTheme.typography.titleMedium)

            Spacer(Modifier.height(12.dp))
            val caption = partialText.ifBlank {
                if (voiceState == VoiceModeState.SPEAKING) {
                    uiState.messages.lastOrNull { it.role != MessageRole.USER }?.text.orEmpty()
                } else ""
            }
            if (caption.isNotBlank()) {
                Text(
                    text = caption,
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }

            Spacer(Modifier.weight(1f))

            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = {
                    isPaused = !isPaused
                    if (isPaused) {
                        recognizer.stopListening()
                    } else if (voiceState != VoiceModeState.SPEAKING) {
                        startListeningInternal()
                    }
                }) {
                    Icon(
                        if (isPaused) Icons.Filled.MicOff else Icons.Filled.Mic,
                        contentDescription = stringResource(Res.string.voice_mode_mic_toggle),
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
                Spacer(Modifier.size(48.dp))
                IconButton(onClick = {
                    recognizer.stopListening()
                    recognizer.cancel()
                    tts.stop()
                    onExit()
                }) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(Res.string.common_back),
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
