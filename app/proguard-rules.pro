# Keep Groq API data models for kotlinx.serialization
-keep,includedescriptorclasses class com.bright.app.data.remote.**$$serializer { *; }
-keepclassmembers class com.bright.app.data.remote.** {
    *** Companion;
}
-keepclasseswithmembers class com.bright.app.data.remote.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Room
-keep class com.bright.app.data.local.** { *; }
