plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
    id("androidx.room")
    id("org.jetbrains.compose")
    id("org.jetbrains.kotlin.plugin.compose")
}

kotlin {
    // Room's @ConstructedBy pattern requires an `expect object`, and expect/actual *classes*
    // are still flagged Beta by the compiler. The warning is unavoidable here (it fires on
    // Room's own generated code), so opt in explicitly rather than leave it as build noise.
    compilerOptions {
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }

    androidTarget {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    // iosX64 = Intel simulator, iosArm64 = real devices, iosSimulatorArm64 = Apple Silicon simulator.
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "Shared"
            // Static, as Compose Multiplatform expects: it avoids the dynamic-framework
            // dance for Compose's own native dependencies (Skia et al.) at app launch.
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
            implementation("androidx.datastore:datastore-preferences-core:1.1.2")

            implementation("io.ktor:ktor-client-core:3.2.2")
            implementation("io.ktor:ktor-client-content-negotiation:3.2.2")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.2.2")
            implementation("io.ktor:ktor-client-logging:3.2.2")

            // Room 2.7.0 is the first stable release with KMP support; sqlite-bundled ships
            // SQLite compiled from source so Android and iOS run the identical engine.
            api("androidx.room:room-runtime:2.7.0")
            implementation("androidx.sqlite:sqlite-bundled:2.5.0")

            // Compose Multiplatform. `api`, not `implementation`: the app module's own screens
            // consume these types (MaterialTheme, Modifier, ...) directly from the shared
            // design system, so they have to stay on its compile classpath.
            //
            // Note the package names in source are still `androidx.compose.*` — Compose
            // Multiplatform only changes the artifact coordinates, not the packages, which is
            // why the moved files needed no import changes at all.
            api(compose.runtime)
            api(compose.foundation)
            api(compose.material3)
            api(compose.ui)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
        androidMain.dependencies {
            // OkHttp engine — keeps the same underlying HTTP stack the app already used via
            // Retrofit, so connection pooling/timeout behavior on Android doesn't change.
            implementation("io.ktor:ktor-client-okhttp:3.2.2")

            // For LocaleUtils' per-app locale override, and the voice-mode speech engines.
            implementation("androidx.appcompat:appcompat:1.7.0")
        }
        iosMain.dependencies {
            // Darwin engine — NSURLSession under the hood, the native choice on iOS.
            implementation("io.ktor:ktor-client-darwin:3.2.2")
        }
    }
}

// Room's KSP processor has to run per-target, not once — each platform gets its own
// generated database implementation (the `actual` for the @ConstructedBy expect object).
dependencies {
    add("kspAndroid", "androidx.room:room-compiler:2.7.0")
    add("kspIosX64", "androidx.room:room-compiler:2.7.0")
    add("kspIosArm64", "androidx.room:room-compiler:2.7.0")
    add("kspIosSimulatorArm64", "androidx.room:room-compiler:2.7.0")
}

room {
    schemaDirectory("$projectDir/schemas")
}

android {
    namespace = "com.bright.shared"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
