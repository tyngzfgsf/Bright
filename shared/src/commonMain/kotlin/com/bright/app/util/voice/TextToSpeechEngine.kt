package com.bright.app.util.voice

import com.bright.app.domain.model.Language

sealed interface SpeechSynthesisEvent {
    data object Started : SpeechSynthesisEvent
    data object Done : SpeechSynthesisEvent
    data object Error : SpeechSynthesisEvent
}

/**
 * Text-to-speech, one instance per "voice mode" session. Same non-`expect`/`actual` reasoning
 * as [SpeechRecognitionEngine] — see that interface's doc comment.
 *
 * Implementations: `AndroidTextToSpeechEngine` (androidMain, wraps `android.speech.tts.TextToSpeech`),
 * `IosTextToSpeechEngine` (iosMain, wraps `AVFoundation`'s `AVSpeechSynthesizer`).
 */
interface TextToSpeechEngine {
    /** Registers the single listener for every event this engine produces, for this engine's
     *  lifetime. Call once, before the first [speak]. */
    fun setEventListener(onEvent: (SpeechSynthesisEvent) -> Unit)

    /** Speaks [text] in [language], replacing anything currently being spoken. [utteranceId] is
     *  opaque to the caller — it exists so multiple concurrent [speak] calls could in principle
     *  be told apart, though this app only ever has one utterance in flight at a time. */
    fun speak(text: String, language: Language, utteranceId: String)

    fun stop()

    /** Releases the underlying platform synthesizer. The engine is unusable after this. */
    fun shutdown()
}
