package com.bright.app.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One graded question/answer pair, kept independently of [SessionEntity]'s running
 * totals so trainees can be re-drilled on the *specific* case they struggled with, not
 * just the scenario type — the foundation for spaced repetition (see
 * RETENTION_FEATURES_PLAN.md). Recorded for every graded answer, not only low-scored
 * ones: the scheduler needs to know what was answered *well* too, to push those further
 * out rather than just never touching them again.
 *
 * The `interval`/`ease`/`repetition`/`dueAt` fields are this row's own SM-2 state (see
 * [com.bright.app.domain.SpacedRepetitionScheduler]): set once at creation from that
 * answer's score, then updated in place — without touching [questionText]/[answerText]/
 * [score], which stay a historical record of the original miss — each time a session
 * started to review this specific record (`SessionEntity.reviewOfRecordId`) gets graded.
 */
@Entity(
    tableName = "question_records",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("sessionId"), Index("score"), Index("dueAtMillis")]
)
data class QuestionRecordEntity(
    @PrimaryKey val id: String,
    val sessionId: String,
    val scenarioType: String?,   // preset key, null when customScenario was used instead
    val customScenario: String?,
    val questionText: String,    // the AI's prompt the trainee was responding to
    val answerText: String,      // the trainee's graded answer
    val score: Int,              // 0-10, see ScenarioPromptBuilder's grading rubric
    val timestampMillis: Long,
    val repetitionCount: Int,
    val easeFactor: Double,
    val intervalDays: Int,
    val dueAtMillis: Long
)
