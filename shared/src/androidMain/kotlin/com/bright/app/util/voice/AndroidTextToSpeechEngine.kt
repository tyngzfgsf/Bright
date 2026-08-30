package com.bright.app.util.voice

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.bright.app.domain.model.Language
import java.util.Locale

class AndroidTextToSpeechEngine(context: Context) : TextToSpeechEngine {

    private val tts = TextToSpeech(context) { }

    override fun setEventListener(onEvent: (SpeechSynthesisEvent) -> Unit) {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { onEvent(SpeechSynthesisEvent.Started) }
            override fun onDone(utteranceId: String?) { onEvent(SpeechSynthesisEvent.Done) }
            override fun onError(utteranceId: String?) { onEvent(SpeechSynthesisEvent.Error) }
        })
    }

    override fun speak(text: String, language: Language, utteranceId: String) {
        tts.language = if (language == Language.KOREAN) Locale.KOREAN else Locale.US
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    override fun stop() { tts.stop() }
    override fun shutdown() { tts.shutdown() }
}
