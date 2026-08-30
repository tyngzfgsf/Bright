package com.bright.app.util.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

class AndroidSpeechRecognitionEngine(context: Context) : SpeechRecognitionEngine {

    private val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
    private var listener: ((SpeechRecognitionEvent) -> Unit)? = null

    override val isAvailable: Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    override fun setEventListener(onEvent: (SpeechRecognitionEvent) -> Unit) {
        listener = onEvent
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {
                onEvent(SpeechRecognitionEvent.VolumeChanged(rmsdB))
            }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                        onEvent(SpeechRecognitionEvent.NoMatch)
                    else -> onEvent(SpeechRecognitionEvent.Error("Speech recognizer error code $error"))
                }
            }
            override fun onResults(results: Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (text.isNullOrBlank()) {
                    onEvent(SpeechRecognitionEvent.NoMatch)
                } else {
                    onEvent(SpeechRecognitionEvent.FinalResult(text))
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                onEvent(SpeechRecognitionEvent.PartialResult(text))
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
    }

    override fun startListening(languageTag: String, partialResults: Boolean) {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partialResults)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        }
        try {
            recognizer.startListening(intent)
        } catch (e: Exception) {
            // Matches the pre-extraction behavior: swallow and let the caller's natural retry
            // trigger (a NoMatch/result callback, or the next explicit start) handle it.
        }
    }

    override fun stopListening() { recognizer.stopListening() }
    override fun cancel() { recognizer.cancel() }
    override fun destroy() { recognizer.destroy() }
}
