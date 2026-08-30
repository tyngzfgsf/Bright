package com.bright.app.util.voice

import com.bright.app.domain.model.Language
import kotlinx.cinterop.ObjCSignatureOverride
import platform.AVFAudio.AVSpeechBoundary
import platform.AVFAudio.AVSpeechSynthesisVoice
import platform.AVFAudio.AVSpeechSynthesizer
import platform.AVFAudio.AVSpeechSynthesizerDelegateProtocol
import platform.AVFAudio.AVSpeechUtterance
import platform.darwin.NSObject

class IosTextToSpeechEngine : TextToSpeechEngine {

    private val synthesizer = AVSpeechSynthesizer()
    private var listener: ((SpeechSynthesisEvent) -> Unit)? = null

    // AVSpeechSynthesizerDelegate has no "error" callback the way Android's TTS does — speech
    // synthesis on iOS doesn't really fail in the same sense, so SpeechSynthesisEvent.Error is
    // simply never emitted from this implementation.
    // Kotlin/Native sees all three delegate callbacks below as the same erased signature
    // (AVSpeechSynthesizer, AVSpeechUtterance) -> Unit — only the ObjC selector keyword
    // (didStart/didFinish/didCancel) tells them apart, and Kotlin doesn't have selector-based
    // overloading. @ObjCSignatureOverride is the compiler-mandated way to keep all three.
    private val delegate = object : NSObject(), AVSpeechSynthesizerDelegateProtocol {
        @ObjCSignatureOverride
        override fun speechSynthesizer(synthesizer: AVSpeechSynthesizer, didStartSpeechUtterance: AVSpeechUtterance) {
            listener?.invoke(SpeechSynthesisEvent.Started)
        }

        @ObjCSignatureOverride
        override fun speechSynthesizer(synthesizer: AVSpeechSynthesizer, didFinishSpeechUtterance: AVSpeechUtterance) {
            listener?.invoke(SpeechSynthesisEvent.Done)
        }

        @ObjCSignatureOverride
        override fun speechSynthesizer(synthesizer: AVSpeechSynthesizer, didCancelSpeechUtterance: AVSpeechUtterance) {
            listener?.invoke(SpeechSynthesisEvent.Done)
        }
    }

    init {
        synthesizer.delegate = delegate
    }

    override fun setEventListener(onEvent: (SpeechSynthesisEvent) -> Unit) {
        listener = onEvent
    }

    override fun speak(text: String, language: Language, utteranceId: String) {
        val utterance = AVSpeechUtterance(string = text)
        val languageTag = if (language == Language.KOREAN) "ko-KR" else "en-US"
        utterance.voice = AVSpeechSynthesisVoice.voiceWithLanguage(languageTag)
        synthesizer.stopSpeakingAtBoundary(AVSpeechBoundary.AVSpeechBoundaryImmediate)
        synthesizer.speakUtterance(utterance)
    }

    override fun stop() {
        synthesizer.stopSpeakingAtBoundary(AVSpeechBoundary.AVSpeechBoundaryImmediate)
    }

    override fun shutdown() {
        synthesizer.delegate = null
    }
}
