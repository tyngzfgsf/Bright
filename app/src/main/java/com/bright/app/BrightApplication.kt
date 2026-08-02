package com.bright.app

import android.app.Application
import com.bright.app.data.local.AppDatabase
import com.bright.app.data.preferences.UserPreferences
import com.bright.app.data.remote.GroqRepository

class BrightApplication : Application() {

    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }
    val userPreferences: UserPreferences by lazy { UserPreferences(this) }
    val groqRepository: GroqRepository by lazy { GroqRepository() }
}
