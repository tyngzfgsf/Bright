package com.bright.app.data.local

import androidx.room.ConstructedBy
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.RoomDatabaseConstructor
import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.execSQL

@Database(
    entities = [SessionEntity::class, MessageEntity::class, QuestionRecordEntity::class],
    version = 6,
    exportSchema = false
)
@ConstructedBy(AppDatabaseConstructor::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun chatDao(): ChatDao
}

/**
 * Room's KSP processor generates the `actual` for this on each platform — that's why there's
 * no `actual` anywhere in this repo and why the "no actual for expect" warning is suppressed.
 */
@Suppress("KotlinNoActualForExpect")
expect object AppDatabaseConstructor : RoomDatabaseConstructor<AppDatabase> {
    override fun initialize(): AppDatabase
}

/**
 * v4 → v5: a scored answer records the criterion its score cites (`MessageEntity.criterionId`).
 *
 * A real migration rather than the destructive fallback below. From here on, dropping tables
 * wipes the part of Bright that's meant to compound — session history, the skill profile and
 * the review queue — so a schema change that only adds a column must never cost a trainee that.
 * Existing answers get null, which the chat UI reads as "graded before citations existed".
 */
internal val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE messages ADD COLUMN criterionId TEXT")
    }
}

/**
 * v5 → v6: the per-session decompensation toggle (off for every existing session) and the
 * on-device trend of a vitals reading. Both additive, so both are plain column adds.
 */
internal val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE sessions ADD COLUMN decompensationEnabled INTEGER NOT NULL DEFAULT 0")
        connection.execSQL("ALTER TABLE messages ADD COLUMN vitalsTrend TEXT")
    }
}

/** The database filename, shared by both platforms' builders. */
const val DATABASE_FILE_NAME = "bright.db"

/**
 * Finishes building the database once a platform has supplied a builder pointing at the right
 * on-disk location (see `getDatabaseBuilder` in androidMain/iosMain). Everything from the
 * driver down is identical across platforms.
 */
fun buildDatabase(builder: RoomDatabase.Builder<AppDatabase>): AppDatabase =
    builder
        .setDriver(BundledSQLiteDriver())
        .addMigrations(MIGRATION_4_5, MIGRATION_5_6)
        // Only for version pairs with no migration above (older dev builds): those still
        // recreate destructively. Every upgrade a real install can make should have one.
        .fallbackToDestructiveMigration(dropAllTables = true)
        .build()
