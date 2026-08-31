package com.bright.app.data.local

import androidx.room.ConstructedBy
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.RoomDatabaseConstructor
import androidx.sqlite.driver.bundled.BundledSQLiteDriver

@Database(
    entities = [SessionEntity::class, MessageEntity::class, QuestionRecordEntity::class],
    version = 4,
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
        // The app is still in active development and schema is changing —
        // destructively recreate rather than write real migrations for now.
        .fallbackToDestructiveMigration(dropAllTables = true)
        .build()
