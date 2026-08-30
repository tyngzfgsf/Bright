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

**Done.** Split into three commits (3a DataStore, 3b Ktor, 3c Room) so any one could be
reverted independently. The whole data layer now lives in `shared/commonMain`; the `app`
module keeps only Android-only code.

- **DataStore (3a).** Moved as-is using the Context-free `datastore-preferences-core`
  artifact. `UserPreferences` now takes a `DataStore<Preferences>` instead of a `Context` —
  *where* the file lives is per-platform, so that decision moved out to each platform's app
  entry point (`BrightApplication.kt` on Android). No rewrite was needed.
- **Retrofit/OkHttp → Ktor (3b).** `GroqApiService` + `NetworkModule` + `GroqRepository`
  replaced by `GroqApiClient` (thin Ktor wrapper) + a rewritten `GroqRepository`. Engine is
  auto-selected per platform (OkHttp on Android, Darwin on iOS) — no `expect/actual` needed.
  `GroqRepository`'s public API is unchanged, so no ViewModel was touched. Plain OkHttp stays
  in `app` for `UpdateChecker`/`ApkDownloader` (Android-only, Phase 4).
- **Room (3c).** Moved largely as-is, as this plan hoped: `SessionEntity`, `MessageEntity`,
  and `ChatDao` needed **zero changes** — their Room annotations are already multiplatform.
  Only `AppDatabase` changed, to Room's KMP `@ConstructedBy` + `expect object
  RoomDatabaseConstructor` pattern, with the `Context`-taking builder split into
  `getDatabaseBuilder()` per platform and a shared `buildDatabase()`. KSP now runs per-target
  (`kspAndroid`, `kspIosX64`, `kspIosArm64`, `kspIosSimulatorArm64`) and the `app` module
  dropped KSP entirely since no annotation processing remains there.
- **`domain/SkillProfile.kt`** — moved to `commonMain` unchanged, as promised in Phase 2. It
  was only ever blocked on `SessionEntity`, so once Room moved it followed for free. (Its
  awkward coupling to a Room `@Entity` remains a valid future cleanup, but it isn't blocking
  anything now, so it wasn't worth churning this phase.)

Things worth knowing that only surfaced by compiling, not from docs:
- **Ktor 3.5.2's klibs require Kotlin 2.3.21**; this project is on 2.2.20 and can't consume
  that klib ABI. Pinned Ktor to **3.2.2** instead of bumping Kotlin project-wide, which would
  have dragged the pinned Compose-compiler and KSP versions along with it.
- **`Dispatchers.IO` is `internal` on Kotlin/Native** with coroutines 1.9.0, so it can't be
  used from `commonMain`. `GroqRepository` uses `Dispatchers.Default`; Room's builder simply
  omits `setQueryCoroutineContext` and takes its default.
- **The Android DB path was preserved deliberately.** Room's old
  `databaseBuilder(ctx, klass, "bright.db")` resolved to the app's database dir; the KMP
  builder takes a full path, so it's given `context.getDatabasePath("bright.db")` to land in
  the same place. Getting this wrong would silently orphan every existing user's history.
- `-Xexpect-actual-classes` is set in `shared/build.gradle.kts` — Room's `@ConstructedBy`
  requires an `expect object`, and the Beta warning fires on Room's own generated code.

Verified: `./gradlew clean assembleDebug` passes, and all three iOS targets compile the
shared module (including Room's KSP running natively per-target).

## Phase 4 — Platform-specific code via expect/actual

**Done.**

- **`LocaleUtils`** — moved to `commonMain` as a genuine `expect object`/`actual object`
  (Android and iOS have the *same* constructor shape here — no Context needed — so
  `expect`/`actual` fit cleanly, unlike DataStore/Room in Phase 3). Android's actual is the
  original `AppCompatDelegate` call, unchanged. iOS's actual overrides the "AppleLanguages"
  `NSUserDefaults` key — the standard workaround, but genuinely weaker than Android's: it only
  takes effect on next launch, since iOS has no public live-locale-override API. Whatever
  calls this on iOS will need to prompt for a relaunch; that UI belongs in Phase 6, not here.

- **Voice Mode / speech recognition.** This did *not* become `expect`/`actual` — constructing
  either platform's engine needs a different thing (Android needs a `Context`; `expect`/`actual`
  requires identical constructor signatures across platforms, and `Context` doesn't exist in
  commonMain). Used a plain common `interface` instead (`SpeechRecognitionEngine`,
  `TextToSpeechEngine` in `commonMain`), each platform providing its own concrete
  implementation — the officially-recommended pattern for exactly this situation. The only
  caller is UI code anyway, which isn't shared until Phase 5, so there's no commonMain code
  that needs to construct one uniformly.
  - **Android**: `AndroidSpeechRecognitionEngine`/`AndroidTextToSpeechEngine`, a faithful
    extraction of the logic that used to live directly inside the `VoiceModeOverlay`
    composable (wrapping `SpeechRecognizer`/`TextToSpeech` exactly as before). Verified: builds
    clean, installs, and launches without error on both a real device and an emulator forced to
    match its screen. **Could not verify the actual voice interaction** — see below.
  - **iOS**: `IosSpeechRecognitionEngine`/`IosTextToSpeechEngine`, wrapping `SFSpeechRecognizer`
    + `AVAudioEngine` (a manual mic tap feeding audio buffers to the recognizer — Speech.framework
    doesn't capture audio itself) and `AVSpeechSynthesizer`. **Compile-verified only, never
    run** — there is no Xcode/iOS Simulator in this environment. Follows Apple's standard,
    widely-documented pattern, which minimizes the chance the *shape* is wrong, but this is
    exactly the kind of code that looks right and isn't until it's run on a real device. Treat
    it as the first thing to manually test once Xcode is available (Phase 6). One specific gap:
    `AVAudioSession.setActive(...)` doesn't resolve under either overload tried (`setActive:error:`
    or `setActive:withOptions:error:`) — both are present in the klib's raw metadata but
    "Unresolved reference" through Kotlin, almost certainly hidden behind a deprecation level
    Kotlin honors even though the ObjC method still exists. Left uncalled (`AVAudioEngine.start()`
    activates the session implicitly in the common case), so the session is also never
    explicitly *deactivated* on stop. Needs whatever the current non-deprecated API actually is,
    findable in about five minutes with real Xcode's autocomplete — not diagnosable further by
    grepping binary klib metadata blind.
  - Real finding from actually attempting the iOS code (not guessed): Kotlin/Native flags
    `@ObjCSignatureOverride` as *required*, not optional, when multiple ObjC delegate callbacks
    erase to the same Kotlin signature (`AVSpeechSynthesizerDelegate`'s `didStart`/`didFinish`/
    `didCancel` all become `(AVSpeechSynthesizer, AVSpeechUtterance) -> Unit` to Kotlin, which
    doesn't have selector-based overloading). Without it, three genuinely-different ObjC
    callbacks are a hard compile error, not a warning.
  - **A discovery unrelated to the migration itself, surfaced while doing this work**:
    `VoiceModeOverlay` has no caller anywhere in the app — not from `ChatScreen`, not from
    navigation, nothing (`git log` shows it was added once and never wired up). So the "real
    device" verification above only confirms the app still launches and the rest of the UI is
    unaffected; the actual voice interaction couldn't be smoke-tested through the running app
    at all, on either platform. Worth fixing (wiring the entry point back in) as its own task —
    out of scope for this migration phase.

- **Update checker / APK installer** (`UpdateChecker`, `ApkDownloader`) — confirmed and left
  untouched. Both use `android.content.Context`/`Intent`/`FileProvider` directly; this concept
  doesn't exist on iOS (the App Store/TestFlight own updates there). Correctly Android-only,
  not a gap to fill.

Verified: `./gradlew clean assembleDebug` passes; installs and launches cleanly on a real
device (Samsung S26) and an emulator; all three iOS targets compile the shared module
including the new Speech/AVFoundation code.

## Phase 5 — Share UI via Compose Multiplatform

**Partially done, deliberately.** This phase said "evaluate", and the evaluation says the work
splits into one part that's essentially free today and one part that is its own project. The
free part is done; the screens are not, and for a concrete reason rather than effort budget.

**Done: Compose Multiplatform toolchain + the whole design system in `commonMain`.**
- CMP 1.8.2 added to `shared` (with the Compose compiler plugin). Pinned below latest
  deliberately: a library built with a *newer* Kotlin than the project's can't be consumed —
  the same klib ABI failure that forced Ktor down to 3.2.2 in Phase 3. Older-library /
  newer-compiler is the safe direction.
- `Color.kt`, `Type.kt`, `BrightButton`, `BrightSlider`, `SelectableChip`, `BrightTextField`
  moved to `commonMain` with **zero source changes** — CMP changes artifact coordinates, not
  package names, so their `androidx.compose.*` imports are still correct. Git records them as
  pure renames.
- `Theme.kt` needed real restructuring, since system-bar tinting is genuinely
  platform-specific: `SystemBarsEffect` and `isSystemInDarkThemeMultiplatform` are now
  `expect`/`actual`. Android's actual is the original `WindowCompat` code; iOS's is an
  intentional no-op (status bar appearance there belongs to the hosting UIViewController, not
  the Compose layer — that lands in Phase 6).
- Package names kept identical (`com.bright.app.ui.theme` / `.ui.components`), so not one
  screen in the app module needed an import change.

Verified: `./gradlew clean assembleDebug` passes; CMP in `shared` and androidx Compose in `app`
coexist with no duplicate-class conflict; all three iOS targets compile the design system; and
the app renders correctly on-device in **both light and dark mode** — the dark check matters,
since it's what actually exercises both new `actual`s.

**Not done: the five screens.** Two hard gates have to be decided first, and both are large
enough to deserve their own phase rather than being smuggled in here.

1. **Resources — the real blocker.** There are **113 `stringResource(...)` call sites across 9
   files**, against **134 strings × 2 languages**. Android resources (`R.string.*`,
   `res/values/` + `res/values-ko/`) do not exist in `commonMain`; CMP has its own parallel
   system (`Res.string.*` backed by `composeResources/`). Moving any screen means migrating the
   entire string catalogue and rewriting every call site. The machinery is already wired up and
   idle — visible as `generateComposeResClass SKIPPED` in the iOS build. It also obsoletes the
   `ScenarioDisplay.kt` `stringRes: Int` extension invented in Phase 2, which would need
   rethinking rather than porting.
2. **ViewModel construction.** Every screen reaches its dependencies via
   `LocalContext.current.applicationContext as BrightApplication` (7 files use `LocalContext`,
   6 use `BrightApplication`). That Android-only handle needs replacing with something
   injectable before any screen compiles in `commonMain` — a small DI seam, but cross-cutting.

Genuinely platform-specific pieces that stay layered on top regardless: `VoiceModeScreen`
(runtime mic permission via `rememberLauncherForActivityResult`), the Settings update card
(`UpdateChecker`/`ApkDownloader`, Android-only by design since Phase 4), and
`BuildConfig.VERSION_NAME`.

**Recommended sequencing if this continues:** do the resources migration as its own isolated
change **on Android only** first — strings move to `composeResources`, all 113 call sites
rewritten, Android app still passing. That is independently valuable, carries no iOS risk, and
turns the screen migration into a mechanical move afterwards. Doing resources and the screen
moves in one pass is exactly the stacking this plan's ground rule warns against.

### Resources migration — **done** (gate 1 of 2 cleared)

All 134 strings × 2 languages moved to `shared/src/commonMain/composeResources/`, and all 113
`stringResource(...)` call sites rewritten from `R.string.*` to `Res.string.*`. The Android
`res/values*/strings.xml` files now hold exactly three strings, for reasons that genuinely
require them: `app_name` (referenced by AndroidManifest.xml) and two update-flow strings read
via `Context.getString()` from `SettingsViewModel`, a non-composable context.

`ScenarioDisplay.kt` **moved to `commonMain`** and its `stringRes` changed from `Int` to
`StringResource` — the Phase 2 workaround (Android-only extension returning a resource ID) is
now gone entirely, which was the whole point. `TourStep` likewise carries `StringResource`
rather than `Int`.

Two real bugs found by running it, both invisible to the compiler:
- **`\'` is an Android resource-compiler escape that Compose Resources does not process.** Eight
  English strings rendered a literal backslash (`it\'s one tap`). Fixed by unescaping to a plain
  apostrophe, which is valid XML. Korean was unaffected (no apostrophes) — so this is a
  language-specific breakage that testing only one locale would have shipped.
- **The Phase 2 iOS `currentSystemLanguageCode()` was using the wrong API.**
  `NSLocale.currentLocale.languageCode` is filtered by the localizations the *app bundle
  declares*, so it reported `"en"` on a fully Korean simulator, while Compose Resources (which
  resolves against `preferredLanguages`) rendered Korean — the same screen disagreeing with
  itself. Now uses `NSLocale.preferredLanguages`, and the two agree.

Verified on-device in **both languages**, including the live in-app language switch (which
confirms Compose Resources honours Android's per-app locale via `AppCompatDelegate`), and with
the parameterized strings actually exercised — a scored session was seeded directly into the
Room database so `%1$d` / `%1$d…%2$d` / `%1$s` formatting all rendered real values rather than
staying untested empty states. On iOS, the harness now shows **real localized scenario names**
instead of the `promptKeyword` fallback, which is the visible proof this gate is cleared.

### Dependency seam — **done** (gate 2 of 2 cleared)

`BrightDependencies` (commonMain) holds the database, preferences, repository and app version
name; `LocalBrightDependencies` is a `staticCompositionLocalOf` provided once at each
platform's entry point. All six screens now read `LocalBrightDependencies.current` instead of
`LocalContext.current.applicationContext as BrightApplication` — the Android-only cast, and the
`Context` it needed, are gone from the UI layer entirely. `BuildConfig.VERSION_NAME` moved into
the container for the same reason.

Deliberately a plain class, not `expect`/`actual`: building it needs different inputs per
platform (Android's DB and DataStore builders both take a `Context`, iOS's take nothing), and
`expect`/`actual` requires identical constructor signatures — the same reasoning as the Phase 4
voice engines.

A missing CompositionLocal provider fails at *runtime*, not compile time, so every screen was
walked on-device rather than trusted to the build.

One more bug found by doing that, in the resources migration above rather than the seam:
**`%1$.1f` in `chat_average_score` rendered verbatim** ("Average score: %1$.1f/10") — Compose
Resources does positional substitution and does not honour printf precision specifiers. My
first scan for parameterized strings used a `%[0-9]+\$[sd]` pattern that matched only `s` and
`d`, so the one float specifier in the catalogue slipped through. Fixed by taking `%1$s` and
formatting the number at the call site, via a new multiplatform `Double.toScoreString()`. That
also let the four remaining `String.format(Locale.US, "%.1f", …)` calls go — they worked, but
are JVM-only and would have blocked those screens from `commonMain`. Note the helper rounds
halves *away from zero* rather than using `kotlin.math.round`, which breaks ties to even: 5.25
displayed as "5.2" instead of the "5.3" users saw before, and matching the old behaviour
mattered more than the tidier standard-library call.

**Both gates are now clear.** What actually remains before a screen can move to `commonMain` is
mechanical rather than architectural: `androidx.lifecycle.ViewModel` and `viewModel()` need to
come from the multiplatform lifecycle artifacts, and the genuinely platform-specific screens
(`VoiceModeScreen`'s mic permission, Settings' Android-only update card) need their platform
pieces layered rather than moved.

## Phase 6 — iOS app shell

**Done: the shared stack runs on the iOS Simulator.** `iosApp/` holds a hand-written Xcode
project (no xcodegen/tuist available) whose build phase calls
`:shared:embedAndSignAppleFrameworkForXcode`, plus a SwiftUI entry point that hosts Compose via
`ComposeUIViewController` (`shared/.../MainViewController.kt`).

- **Xcode**: 27.0 beta, not 26.6 stable — macOS 27 requires it. Notably the *beta* already had
  its license accepted while the stable one did not, so no `sudo` was needed after all.
- **Linking, finally.** Everything in Phases 1–5 had only ever been klib *compilation*; the
  first `linkDebugFrameworkIosSimulatorArm64` is the first time the Speech/AVFoundation, Room
  and Ktor iOS code was actually linked. It linked with no missing symbols, and the framework
  exports 360 Objective-C interfaces covering the whole shared API.
- **Verified at runtime on the simulator**, which is stronger than anything before this phase:
  Compose Multiplatform renders `commonMain` code; the shared design system (theme, typography,
  `SelectableChip`, `BrightTextField`, `BrightButton`) draws correctly; the Phase 2
  `currentSystemLanguageCode()` iOS `actual` returns a real value from `NSLocale`; and the
  Phase 5 `isSystemInDarkThemeMultiplatform()` `actual` works — **dark mode was checked
  explicitly** and renders the dark palette.

Two real problems found only by running it, neither predictable from compiling:
- **Compose Multiplatform hard-requires `CADisableMinimumFrameDurationOnPhone` = `true` in
  Info.plist** (the ProMotion 120fps opt-out). Without it `androidx.compose.ui.uikit`'s
  `PlistSanityCheck` throws and aborts the process. It fires **asynchronously**, so the app
  renders a full, correct first frame and *then* dies — the first screenshot taken looked like
  a complete success while the app was already doomed. Worth remembering: on iOS "it rendered"
  is not evidence it survived.
- **Xcode's `GENERATE_INFOPLIST_FILE` / `INFOPLIST_KEY_*` mechanism cannot set that key** — it
  only supports Apple's documented allowlist, and silently drops anything else (the build
  succeeded; the key simply wasn't in the output plist). Hence `iosApp/iosApp/Info.plist` is a
  real checked-in file rather than generated.

Not done in this phase, and deliberately so: the app shown is a **validation harness, not
Bright**. It renders shared components and shared domain types, because the real screens can't
move to `commonMain` until the Phase 5 resources and ViewModel-construction gates are resolved.
Chips display `ScenarioType.promptKeyword` rather than proper names precisely because display
names still live in Android resources — the resources gate, made visible.

Also still unverified on iOS: the Phase 4 voice engines. `NSMicrophoneUsageDescription` and
`NSSpeechRecognitionUsageDescription` are already in the Info.plist so they *can* run, but
nothing in this harness exercises `SFSpeechRecognizer`/`AVAudioEngine` yet — including the
known-unresolved `AVAudioSession.setActive(...)` binding noted under Phase 4.

Remaining from the original plan:

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
