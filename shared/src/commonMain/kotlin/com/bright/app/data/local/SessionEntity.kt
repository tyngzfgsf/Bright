package com.bright.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey val id: String,
    val scenarioType: String?,      // preset key, null when customScenario is used instead
    val customScenario: String?,    // user-typed scenario text, null when a preset is used
    val aiRole: String,             // resolved "PATIENT" or "DOCTOR" (random is resolved once at creation)
    val customAiRole: String?,      // user-typed AI role text, overrides aiRole's default framing when set
    val role: String,               // trainee's own role (doctor/nurse/EMT)
    val difficulty: String,
    val languageCode: String,
    val startedAtMillis: Long,
    val lastUpdatedAtMillis: Long,
    val isCompleted: Boolean,
    val summary: String? = null,
    val totalScore: Int = 0,        // running sum of all graded answers this session
    val answeredCount: Int = 0      // number of graded answers, for computing the average
)
