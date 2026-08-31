package com.bright.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: SessionEntity)

    @Update
    suspend fun updateSession(session: SessionEntity)

    @Query("SELECT * FROM sessions ORDER BY lastUpdatedAtMillis DESC")
    fun observeSessions(): Flow<List<SessionEntity>>

    /** Sessions with at least one graded answer — the input to the skill profile. */
    @Query("SELECT * FROM sessions WHERE answeredCount > 0")
    fun observeScoredSessions(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE id = :sessionId")
    suspend fun getSession(sessionId: String): SessionEntity?

    @Query("DELETE FROM sessions WHERE id = :sessionId")
    suspend fun deleteSession(sessionId: String)

    @Query("DELETE FROM sessions")
    suspend fun deleteAllSessions()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity)

    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY timestampMillis ASC")
    fun observeMessages(sessionId: String): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuestionRecord(record: QuestionRecordEntity)

    @Update
    suspend fun updateQuestionRecord(record: QuestionRecordEntity)

    @Query("SELECT * FROM question_records WHERE id = :id")
    suspend fun getQuestionRecord(id: String): QuestionRecordEntity?

    @Query("SELECT * FROM question_records ORDER BY timestampMillis DESC")
    fun observeQuestionRecords(): Flow<List<QuestionRecordEntity>>

    /** The individual missed/low-scored questions the scheduler draws from. */
    @Query("SELECT * FROM question_records WHERE score <= :maxScore ORDER BY timestampMillis DESC")
    fun observeLowScoredQuestionRecords(maxScore: Int): Flow<List<QuestionRecordEntity>>

    /** The review queue: items due now, most overdue (soonest due date) first. */
    @Query("SELECT * FROM question_records WHERE dueAtMillis <= :nowMillis ORDER BY dueAtMillis ASC")
    fun observeDueQuestionRecords(nowMillis: Long): Flow<List<QuestionRecordEntity>>
}
