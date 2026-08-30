# Bright — Kotlin Multiplatform migration plan

Goal: reuse as much of Bright's existing logic as possible for an iOS app, via Kotlin
Multiplatform + Compose Multiplatform, instead of maintaining two separate codebases.

**Ground rule for every phase below: the Android app must still build and run correctly
after each phase.** Run `./gradlew clean assembleDebug` after every phase and treat a
broken Android build as a blocker before moving to the next phase — don't stack multiple
phases of unverified change on top of each other.

## Phase 0 — Baseline

- Confirm current state: `./gradlew clean assembleDebug` passes.
- Commit this as a known-good checkpoint before touching project structure.

## Phase 1 — Restructure into KMP modules

- Add the Kotlin Multiplatform Gradle plugin.
- Create a `shared` module with `commonMain`, `androidMain`, and `iosMain` source sets.
- Move `app` to depend on `shared` rather than containing everything itself.
- No logic changes yet — just get the module structure in place and confirm Android
  still builds against it.

## Phase 2 — Move pure logic to `commonMain` (lowest risk, do first)

**Done**, with two corrections to what this phase originally assumed:

- `domain/model/*` (ScenarioType, Language, Difficulty, TraineeRole, AiCharacterRole) and
  `data/remote/GroqModels.kt` are in `commonMain` now.
- These were **not** actually dependency-free as assumed:
  - `ScenarioType`/`TraineeRole`/`AiCharacterRole` carried `val stringRes: Int` pointing at
    `com.bright.app.R.string.*` — Android's generated resource class, unavailable outside
    the Android target. Stripped from the enums; the Android app module now supplies the
    mapping itself as an extension property (`app/.../domain/model/ScenarioDisplay.kt`) in
    the same package, so every existing `foo.stringRes` call site kept working with just an
    added import. iOS gets its own equivalent mapping in Phase 5/6.
  - `Language.fromSystemDefault()` called `java.util.Locale.getDefault()`, JVM-only. Pulled
    into `expect fun currentSystemLanguageCode()`, with `actual` implementations in
    `androidMain` (`java.util.Locale`) and `iosMain` (`NSLocale.currentLocale`).
- `domain/SkillProfile.kt` **stayed in the Android app module** — deferred to Phase 3.
  `SkillProfile.compute()` takes `List<SessionEntity>`, a Room `@Entity`; moving
  `SkillProfile` now would require moving `SessionEntity` too, which is explicitly Phase 3
  work (and stacking that in early would violate this plan's own ground rule about not
  combining unverified phases). Decoupling `SkillProfile` from the Room entity — e.g. having
  it take a plain data class instead, mapped from `SessionEntity` at the call site — is an
  option worth considering when Phase 3 gets to Room, but that's a call for that phase, not
  a silent scope-add to this one.
- Also discovered in verification, unrelated to the file moves themselves: Kotlin disallows
  smart-casting a nullable `val` on a type declared in a *different Gradle module* — code in
  `SettingsScreen.kt` that did `if (u.remainingRequests != null) { ...u.remainingRequests... }`
  stopped compiling once `GroqUsageInfo` moved to `shared`. Fixed by capturing into local
  `val`s first. Worth knowing about going forward: any other cross-module nullable-property
  smart-cast in the app will hit the same thing as more types move to `shared`.

Verified: `./gradlew clean assembleDebug` passes, and all three iOS targets
(iosArm64, iosX64, iosSimulatorArm64) compile `shared` including the new files.

## Phase 3 — Replace Android-only libraries with KMP-compatible ones (in `commonMain`)

- **Retrofit/OkHttp → Ktor Client.** Rewrite `GroqApiService`/`GroqRepository` on Ktor,
  which has first-class KMP support. This is the biggest rewrite in this phase.
- **Room → check current KMP support first.** Room 2.7+ has official Kotlin Multiplatform
  support; since the project is already on Room 2.7.0, check whether `ChatDao`/
  `SessionEntity`/`MessageEntity` can move to `commonMain` largely as-is before assuming
  a rewrite is needed.
- **DataStore → also has official KMP support** — check current version compatibility
  before assuming `UserPreferences` needs replacing.
- **`domain/SkillProfile.kt`** — carried over from Phase 2 (see that section): it takes
  `List<SessionEntity>` directly, so it can't move to `commonMain` until `SessionEntity`
  does. Once Room's KMP move above happens, either move `SkillProfile` alongside it, or take
  the opportunity to decouple it to a plain data class input first — pure functions
  shouldn't really take a Room `@Entity` as a parameter regardless of KMP.

Verify Android build after this phase.

## Phase 4 — Platform-specific code via expect/actual

These have no iOS equivalent and need real (not ported) implementations:
- **Voice Mode / speech recognition** — Android uses `SpeechRecognizer`; iOS needs
  `Speech`/`AVFoundation` via Swift interop. Use `expect`/`actual` to declare the
  interface in `commonMain` and implement separately per platform.
- **Update checker / APK installer** (`UpdateChecker`, `ApkDownloader`) — this concept
  doesn't exist on iOS (Apple handles app updates via the App Store/TestFlight, sideloaded
  installs aren't a thing). Keep this Android-only; don't try to port it. iOS just won't
  have this feature, and that's correct, not a gap to fill.
- `LocaleUtils` — needs an iOS-specific locale implementation.

## Phase 5 — Share UI via Compose Multiplatform

Once logic is shared and stable, evaluate moving Compose screens (`HomeScreen`,
`ChatScreen`, `SettingsScreen`, `StatsScreen`, `OnboardingScreen`) into `commonMain` using
Compose Multiplatform, which now supports iOS as a real target. Screens with
platform-specific pieces (Voice Mode, the update card in Settings) will need conditional
logic or platform-specific composables layered on top of a shared base.

## Phase 6 — iOS app shell

- Xcode project wrapping the Compose Multiplatform UI (or, if Phase 5 is skipped/deferred,
  a native SwiftUI shell calling into the shared Kotlin module for logic only).
- Build and run on the iOS Simulator first — no Apple Developer Program needed for this.
- Apple Developer Program ($99/year) is only needed when actually submitting to the App
  Store or distributing via TestFlight to others — defer that cost until this phase is
  genuinely ready to ship.

## Known constraints going in

- No macOS/Xcode-based verification exists outside of what Claude Code runs directly on
  Jason's own Mac — there is no remote/sandboxed way to check iOS-side correctness.
- Apple's App Store review has historically given extra scrutiny to apps requiring a
  user-supplied third-party API key (BYOK, as Bright currently does for Groq). Not a
  guaranteed rejection, but worth surfacing early rather than discovering it at review time.
- This is a multi-session effort. Don't attempt to do multiple phases in one pass — verify
  each phase's Android build before moving to the next, and commit at each verified
  checkpoint so a bad phase can be rolled back without losing earlier progress.
