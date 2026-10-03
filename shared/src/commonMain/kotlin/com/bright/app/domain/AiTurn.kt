package com.bright.app.domain

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlin.math.roundToInt

data class AiTurn(
    val score: Int? = null,
    val feedback: String? = null,
    /**
     * The criterion the model says this score was judged against, as it wrote it. Untrusted:
     * `ChatViewModel` resolves it against the criteria the session actually offered (see
     * `ScoringCriteria.resolve`) before anything is stored or shown.
     */
    val basis: String? = null,
    val nextPrompt: String = "",
    val sessionComplete: Boolean = false
)

object AiTurnParser {

    @OptIn(ExperimentalSerializationApi::class)
    private val json = Json {
        isLenient = true
        allowTrailingComma = true
        allowComments = true
    }

    private val SCORE_KEYS = listOf("score", "grade")
    private val FEEDBACK_KEYS = listOf("feedback")
    private val BASIS_KEYS = listOf("basis", "scoring_basis", "criterion", "criterion_id", "citation")
    private val NEXT_PROMPT_KEYS = listOf("next_prompt", "nextprompt", "next_question", "question")
    private val COMPLETE_KEYS = listOf("session_complete", "sessioncomplete")
    private val ALL_KEYS = SCORE_KEYS + FEEDBACK_KEYS + BASIS_KEYS + NEXT_PROMPT_KEYS + COMPLETE_KEYS

    /** "7", "7.5", "7/10", " 7 / 10 " — but not "70" or "7 out of 10 for effort". */
    private val SCORE_TEXT = Regex("""(\d{1,2}(?:\.\d+)?)\s*(?:/\s*10)?""")

    /**
     * Groq's output is usually one clean JSON object, but models vary: a markdown fence, a
     * sentence before or after, a trailing comma, the score as "7/10", the citation as an
     * object or a list, a key in camelCase. Each field is read on its own and forgivingly, so
     * one odd field costs that field rather than the whole turn — a score shouldn't vanish
     * because the citation next to it came back in an unexpected shape.
     *
     * Only when there's no JSON object carrying any known field does the raw text become the
     * next question, as before: a malformed turn still never crashes the session.
     */
    fun parse(raw: String): AiTurn {
        val fields = findTurnObject(raw)
            ?.entries
            ?.associate { (key, value) -> key.lowercase() to value }
            ?: return AiTurn(nextPrompt = raw.trim())

        return AiTurn(
            score = fields.firstPresent(SCORE_KEYS)?.let(::scoreFrom),
            feedback = fields.firstPresent(FEEDBACK_KEYS)?.let(::textFrom),
            basis = fields.firstPresent(BASIS_KEYS)?.let(::basisFrom),
            nextPrompt = fields.firstPresent(NEXT_PROMPT_KEYS)?.let(::textFrom).orEmpty(),
            sessionComplete = fields.firstPresent(COMPLETE_KEYS)?.let(::booleanFrom) ?: false
        )
    }

    /**
     * Tries each `{` in turn, cut to its balanced closing brace (quote- and escape-aware, so a
     * brace inside a string doesn't end the object early), and keeps the first that parses and
     * carries a field we know. The old first-`{`-to-last-`}` cut is kept as a last resort.
     */
    private fun findTurnObject(raw: String): JsonObject? {
        var start = raw.indexOf('{')
        while (start >= 0) {
            balancedEnd(raw, start)?.let { end ->
                parseObject(raw.substring(start, end + 1))?.takeIf(::hasKnownField)?.let { return it }
            }
            start = raw.indexOf('{', start + 1)
        }
        val first = raw.indexOf('{')
        val last = raw.lastIndexOf('}')
        return if (first in 0 until last) parseObject(raw.substring(first, last + 1))?.takeIf(::hasKnownField) else null
    }

    private fun balancedEnd(text: String, start: Int): Int? {
        var depth = 0
        var inString = false
        var escaped = false
        for (i in start until text.length) {
            val c = text[i]
            when {
                escaped -> escaped = false
                inString && c == '\\' -> escaped = true
                c == '"' -> inString = !inString
                inString -> Unit
                c == '{' -> depth++
                c == '}' -> if (--depth == 0) return i
            }
        }
        return null
    }

    private fun parseObject(text: String): JsonObject? =
        runCatching { json.parseToJsonElement(text) as? JsonObject }.getOrNull()

    private fun hasKnownField(obj: JsonObject): Boolean = obj.keys.any { it.lowercase() in ALL_KEYS }

    /** The first of [keys] that's present and not an explicit null. */
    private fun Map<String, JsonElement>.firstPresent(keys: List<String>): JsonElement? =
        keys.firstNotNullOfOrNull { key -> this[key]?.takeUnless { it is JsonNull } }

    private fun scoreFrom(element: JsonElement): Int? {
        val primitive = element as? JsonPrimitive ?: return null
        val number = SCORE_TEXT.matchEntire(primitive.content.trim())?.groupValues?.get(1)?.toDoubleOrNull()
            ?: return null
        // Out of range is dropped, not clamped: a "15" is a malformed score, not a 10.
        return number.roundToInt().takeIf { it in 0..10 }
    }

    private fun textFrom(element: JsonElement): String? = when (element) {
        is JsonPrimitive -> element.content.trim().takeUnless { it.isEmpty() || it.equals("null", ignoreCase = true) }
        is JsonArray -> element.mapNotNull(::textFrom).joinToString(" ").takeIf { it.isNotEmpty() }
        is JsonObject -> null
    }

    private fun booleanFrom(element: JsonElement): Boolean? {
        val primitive = element as? JsonPrimitive ?: return null
        return primitive.booleanOrNull ?: when (primitive.content.trim().lowercase()) {
            "true", "yes", "1" -> true
            "false", "no", "0" -> false
            else -> null
        }
    }

    private fun basisFrom(element: JsonElement): String? = when (element) {
        is JsonPrimitive -> textFrom(element)
        is JsonArray -> element.firstNotNullOfOrNull(::basisFrom)
        is JsonObject -> element.entries
            .associate { (key, value) -> key.lowercase() to value }
            .firstPresent(listOf("id", "criterion_id", "code", "basis", "criterion"))
            ?.let(::basisFrom)
    }
}
