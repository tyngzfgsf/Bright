package com.bright.app.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "messages",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("sessionId")]
)
data class MessageEntity(
    @PrimaryKey val id: String,
    val sessionId: String,
    val role: String,
    val text: String,
    val score: Int? = null,
    /**
     * The `ScoringCriteria` ID a score was judged against; `ScoringCriteria.UNCITED` when a score
     * cited nothing usable; null for everything else, including answers graded before v5.
     */
    val criterionId: String? = null,
    /** `VitalsTrend` name for an AI_VITALS reading (v6); null for every other message. */
    val vitalsTrend: String? = null,
    val timestampMillis: Long
)
