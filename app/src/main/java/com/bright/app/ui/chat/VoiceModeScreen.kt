package com.bright.app.ui.chat

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.bright.app.R
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.MessageRole
import java.util.Locale

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

    val recognitionAvailable = remember { SpeechRecognizer.isRecognitionAvailable(context) }

    if (!hasPermission || !recognitionAvailable) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(
                        if (recognitionAvailable) R.string.voice_mode_permission_needed else R.string.chat_voice_unavailable
                    ),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 32.dp)
                )
                Spacer(Modifier.height(20.dp))
                TextButton(onClick = onExit) {
                    Text(stringResource(R.string.common_back), color = Color.White)
                }
            }
        }
        return
    }

    var voiceState by remember { mutableStateOf(VoiceModeState.LISTENING) }
    var partialText by remember { mutableStateOf("") }
    var rmsLevel by remember { mutableFloatStateOf(0f) }
    var isPaused by remember { mutableStateOf(false) }

    val recognizer = remember { SpeechRecognizer.createSpeechRecognizer(context) }
    var tts by remember { mutableStateOf<TextToSpeech?>(null) }

    fun buildRecognizerIntent(): Intent {
        val localeTag = if (uiState.language == Language.KOREAN) "ko-KR" else "en-US"
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        }
    }

    fun startListeningInternal() {
        if (isPaused || uiState.isCompleted) return
        partialText = ""
        voiceState = VoiceModeState.LISTENING
        try {
            recognizer.startListening(buildRecognizerIntent())
        } catch (e: Exception) {
            // Will retry on the next natural trigger (result/error/tts-done).
        }
    }

    DisposableEffect(Unit) {
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) { rmsLevel = rmsdB }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                        if (!isPaused && !uiState.isCompleted) startListeningInternal()
                    else -> voiceState = VoiceModeState.ERROR
                }
            }
            override fun onResults(results: Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                partialText = ""
                if (!text.isNullOrBlank()) {
                    voiceState = VoiceModeState.PROCESSING
                    viewModel.sendMessage(text)
                } else if (!isPaused && !uiState.isCompleted) {
                    startListeningInternal()
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                partialText = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull().orEmpty()
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        onDispose {
            recognizer.stopListening()
            recognizer.cancel()
            recognizer.destroy()
        }
    }

    DisposableEffect(Unit) {
        val instance = TextToSpeech(context) { }
        instance.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { voiceState = VoiceModeState.SPEAKING }
            override fun onDone(utteranceId: String?) {
                if (!isPaused && !uiState.isCompleted) startListeningInternal()
            }
            override fun onError(utteranceId: String?) {
                if (!isPaused && !uiState.isCompleted) startListeningInternal()
            }
        })
        tts = instance
        onDispose {
            instance.stop()
            instance.shutdown()
        }
    }

    LaunchedEffect(tts, uiState.language) {
        tts?.language = if (uiState.language == Language.KOREAN) Locale.KOREAN else Locale.US
    }

    LaunchedEffect(Unit) { startListeningInternal() }

    LaunchedEffect(uiState.messages.lastOrNull()?.id) {
        val last = uiState.messages.lastOrNull()
        if (last != null && last.role != MessageRole.USER && last.text.isNotBlank()) {
            recognizer.stopListening()
            tts?.speak(last.text, TextToSpeech.QUEUE_FLUSH, null, last.id)
        }
    }

    val statusText = when {
        uiState.isCompleted -> stringResource(R.string.voice_mode_session_complete)
        isPaused -> stringResource(R.string.voice_mode_paused)
        voiceState == VoiceModeState.LISTENING -> stringResource(R.string.voice_mode_listening)
        voiceState == VoiceModeState.PROCESSING -> stringResource(R.string.chat_thinking)
        voiceState == VoiceModeState.SPEAKING -> stringResource(R.string.voice_mode_speaking)
        else -> stringResource(R.string.voice_mode_error)
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
                        contentDescription = stringResource(R.string.voice_mode_mic_toggle),
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
                Spacer(Modifier.size(48.dp))
                IconButton(onClick = {
                    recognizer.stopListening()
                    recognizer.cancel()
                    tts?.stop()
                    onExit()
                }) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.common_back),
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
