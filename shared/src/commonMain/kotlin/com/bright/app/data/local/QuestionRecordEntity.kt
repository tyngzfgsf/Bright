package com.bright.app.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One graded question/answer pair, kept independently of [SessionEntity]'s running
 * totals so trainees can be re-drilled on the *specific* case they struggled with, not
 * just the scenario type — the foundation for spaced repetition (see
 * RETENTION_FEATURES_PLAN.md Phase 2). Recorded for every graded answer, not only
 * low-scored ones: a scheduler needs to know what was answered *well* too, to push
 * those further out rather than just never touching them again.
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
    indices = [Index("sessionId"), Index("score")]
)
data class QuestionRecordEntity(
    @PrimaryKey val id: String,
    val sessionId: String,
    val scenarioType: String?,   // preset key, null when customScenario was used instead
    val customScenario: String?,
    val questionText: String,    // the AI's prompt the trainee was responding to
    val answerText: String,      // the trainee's graded answer
    val score: Int,              // 0-10, see ScenarioPromptBuilder's grading rubric
    val timestampMillis: Long
)
