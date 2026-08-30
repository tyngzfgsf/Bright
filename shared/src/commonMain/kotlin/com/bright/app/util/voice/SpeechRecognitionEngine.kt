package com.bright.app.util.voice

/** One event from an ongoing [SpeechRecognitionEngine] listening session. */
sealed interface SpeechRecognitionEvent {
    /** An in-progress transcription — the caller typically shows this as live captioning. */
    data class PartialResult(val text: String) : SpeechRecognitionEvent

    /** The recognizer has committed to a final transcription for this utterance. */
    data class FinalResult(val text: String) : SpeechRecognitionEvent

    /** Mic input level, for a live waveform/orb visualization. Units are engine-specific. */
    data class VolumeChanged(val level: Float) : SpeechRecognitionEvent

    /** No speech detected, or the listening window timed out. Not a real error — callers
     *  restart listening in response to this exactly like they would after a FinalResult. */
    data object NoMatch : SpeechRecognitionEvent

    data class Error(val message: String) : SpeechRecognitionEvent
}

/**
 * Streaming speech-to-text, one instance per "voice mode" session.
 *
 * No `expect`/`actual` here deliberately: constructing either implementation needs a
 * platform-specific handle (an Android `Context`; on iOS, nothing extra, but the *shape* of
 * "what's needed to construct one" legitimately differs per platform, and `expect`/`actual`
 * requires identical constructor signatures across platforms). Since the only caller is always
 * platform UI code anyway — not shared until Phase 5 — a plain common interface with two
 * independent concrete implementations is the right tool: `AndroidSpeechRecognitionEngine`
 * (androidMain, wraps `android.speech.SpeechRecognizer`) and `IosSpeechRecognitionEngine`
 * (iosMain, wraps `Speech.framework`'s `SFSpeechRecognizer` + `AVAudioEngine`).
 */
interface SpeechRecognitionEngine {
    /** Whether on-device speech recognition is available at all on this device. */
    val isAvailable: Boolean

    /** Registers the single listener for every event this engine produces, for this engine's
     *  lifetime. Call once, before the first [startListening]. */
    fun setEventListener(onEvent: (SpeechRecognitionEvent) -> Unit)

    /**
     * Starts (or restarts) listening for one utterance. [languageTag] is a BCP-47 tag
     * (e.g. "en-US", "ko-KR"). Safe to call again while already listening, to restart —
     * that's the normal way callers recover from [SpeechRecognitionEvent.NoMatch].
     */
    fun startListening(languageTag: String, partialResults: Boolean = true)

    fun stopListening()
    fun cancel()

    /** Releases the underlying platform recognizer. The engine is unusable after this. */
    fun destroy()
}
