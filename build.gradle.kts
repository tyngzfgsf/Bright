plugins {
    id("com.android.application") version "8.9.0" apply false
    id("com.android.library") version "8.9.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
    id("org.jetbrains.kotlin.multiplatform") version "2.2.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.20" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.20" apply false
    id("com.google.devtools.ksp") version "2.2.20-2.0.4" apply false
    id("androidx.room") version "2.7.0" apply false
    // Reads app/google-services.json and generates the Firebase config into resources. Applied
    // only by the :app module — :shared stays Firebase-free so the iOS targets keep building.
    id("com.google.gms.google-services") version "4.4.2" apply false
    // Compose Multiplatform. Deliberately an older-than-latest release: a library built with a
    // NEWER Kotlin than the project's can't be consumed (the klib ABI failure that forced Ktor
    // down to 3.2.2 in Phase 3). Older-library/newer-compiler is the safe direction.
    id("org.jetbrains.compose") version "1.8.2" apply false
}
