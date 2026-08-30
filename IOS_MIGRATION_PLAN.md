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

These have little to no Android dependency already:
- `domain/SkillProfile.kt`
- `domain/model/*` (ScenarioType, Language, Difficulty, TraineeRole, AiCharacterRole)
- `data/remote/GroqModels.kt` (kotlinx.serialization data classes)

Verify Android build after this phase — these should compile into `commonMain` with
little to no modification.

## Phase 3 — Replace Android-only libraries with KMP-compatible ones (in `commonMain`)

- **Retrofit/OkHttp → Ktor Client.** Rewrite `GroqApiService`/`GroqRepository` on Ktor,
  which has first-class KMP support. This is the biggest rewrite in this phase.
- **Room → check current KMP support first.** Room 2.7+ has official Kotlin Multiplatform
  support; since the project is already on Room 2.7.0, check whether `ChatDao`/
  `SessionEntity`/`MessageEntity` can move to `commonMain` largely as-is before assuming
  a rewrite is needed.
- **DataStore → also has official KMP support** — check current version compatibility
  before assuming `UserPreferences` needs replacing.

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
