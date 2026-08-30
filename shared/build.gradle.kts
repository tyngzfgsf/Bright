plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    // iosX64 = Intel simulator, iosArm64 = real devices, iosSimulatorArm64 = Apple Silicon simulator.
    // Declared now so the source-set layout is real; nothing links against them until Phase 6.
    iosX64()
    iosArm64()
    iosSimulatorArm64()

    sourceSets {
        commonMain.dependencies {
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
            implementation("androidx.datastore:datastore-preferences-core:1.1.2")

            implementation("io.ktor:ktor-client-core:3.5.2")
            implementation("io.ktor:ktor-client-content-negotiation:3.5.2")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.5.2")
            implementation("io.ktor:ktor-client-logging:3.5.2")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
        androidMain.dependencies {
            // OkHttp engine — keeps the same underlying HTTP stack the app already used via
            // Retrofit, so connection pooling/timeout behavior on Android doesn't change.
            implementation("io.ktor:ktor-client-okhttp:3.5.2")
        }
        iosMain.dependencies {
            // Darwin engine — NSURLSession under the hood, the native choice on iOS.
            implementation("io.ktor:ktor-client-darwin:3.5.2")
        }
    }
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
