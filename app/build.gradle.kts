plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.gms.google-services")
}

val versionNameOverride = (project.findProperty("versionNameOverride") as String?)?.removePrefix("v")

// Stripe publishable key (pk_test_… / pk_live_…) and the Stripe account's country. Neither is a
// secret — publishable keys are designed to ship in apps. Set them in ~/.gradle/gradle.properties
// or pass -P on the command line; CI passes them from repository variables. Left empty, the app
// still builds and runs, and the paywall reports purchases as unavailable. See MONETIZATION.md.
val stripePublishableKey = (project.findProperty("stripePublishableKey") as String?).orEmpty()
val stripeMerchantCountry = (project.findProperty("stripeMerchantCountry") as String?) ?: "US"

android {
    namespace = "com.bright.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bright.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = versionNameOverride ?: "1.5"

        buildConfigField("String", "STRIPE_PUBLISHABLE_KEY", "\"$stripePublishableKey\"")
        buildConfigField("String", "STRIPE_MERCHANT_COUNTRY", "\"$stripeMerchantCountry\"")

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(project(":shared"))

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.activity:activity-compose:1.10.0")

    implementation(platform("androidx.compose:compose-bom:2026.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    debugImplementation("androidx.compose.ui:ui-tooling")


    implementation("androidx.datastore:datastore-preferences-core:1.1.2")
    implementation("com.squareup.okio:okio:3.9.0")

    // Still used directly (not via Retrofit) by UpdateChecker/ApkDownloader — those stay
    // Android-only (Phase 4: no iOS equivalent, App Store handles updates there).
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // --- Firebase Analytics ---
    // Free on the Spark plan; needs no Blaze upgrade and no Cloud Functions. Android-only, in
    // :app — the shared code sees only the platform-neutral Analytics interface.
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-analytics")
    // --- Firebase Auth / Google Sign-In (BACKEND_PLAN.md Phase 1) ---
    // Android-only on purpose: these live in :app, not :shared, so the KMP iOS targets are
    // untouched. The shared code sees only the platform-neutral AuthService interface.
    //
    // Version comes from the Firebase BOM declared above with Analytics.
    implementation("com.google.firebase:firebase-auth")

    // Credential Manager is the current Google Sign-In path; the old
    // com.google.android.gms.auth.api.signin API is deprecated. `credentials-play-services-auth`
    // is the provider that actually serves Google accounts — without it the request finds no
    // credentials at runtime even though everything compiles.
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Callable Cloud Functions — the billing endpoints (bright-site/functions/billing/stripe.js).
    implementation("com.google.firebase:firebase-functions")

    // Stripe PaymentSheet: the in-app payment UI, with Google Pay and cards. Never a web page.
    // Pinned to 22.8.1, the last release that builds with compileSdk 35 / AGP 8.9.0 — 23.x pulls
    // androidx.activity 1.12 and browser 1.9, which need compileSdk 36 and AGP 8.9.1+. Move up
    // together with a compileSdk bump.
    implementation("com.stripe:stripe-android:22.8.1")

    // Task<T>.await(), for bridging Firebase's Play-Services Tasks into suspend functions.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.06.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
