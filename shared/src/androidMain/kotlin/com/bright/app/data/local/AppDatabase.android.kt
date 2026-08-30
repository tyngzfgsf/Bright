package com.bright.app.data.local

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Resolves to the same path the pre-KMP code used: `Room.databaseBuilder(ctx, klass, "bright.db")`
 * put the file in the app's database directory, which is exactly what `getDatabasePath` returns.
 * Keeping it identical means existing installs keep their history instead of silently starting empty.
 */
fun getDatabaseBuilder(context: Context): RoomDatabase.Builder<AppDatabase> {
    val appContext = context.applicationContext
    val dbFile = appContext.getDatabasePath(DATABASE_FILE_NAME)
    return Room.databaseBuilder<AppDatabase>(
        context = appContext,
        name = dbFile.absolutePath
    )
}
