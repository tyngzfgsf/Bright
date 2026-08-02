# Bright
*A step for your brighter future*

Bright is an Android app that drops you into AI-generated medical emergency scenarios.
The AI plays the patient (and any supporting bystanders/staff), you play the trainee
doctor/nurse/EMT and respond by typing — the AI reacts realistically to what you say and
do, and gives you a debrief when the session ends. Everything is stored locally on-device.

Built with Kotlin + Jetpack Compose, targeting Android Studio on macOS (Apple Silicon).

---

## 1. One-time setup

### 1.1 Open the project
Unzip this folder and open it in Android Studio (**File → Open**, select the `Bright` folder).

### 1.2 Gradle wrapper
This zip does **not** include the `gradle-wrapper.jar` binary (binaries don't travel well
through this export). The first time you open the project, Android Studio will detect the
missing wrapper jar and prompt you to fix it — accept the prompt, or run this once from a
terminal in the project root if you have Gradle installed via Homebrew:

```bash
gradle wrapper --gradle-version 8.13
```

Either way, Android Studio will sync normally after that.

### 1.3 Get a free Groq API key
Bright uses [Groq](https://console.groq.com) to run the AI. Sign up, create a key on the
**API Keys** page, and keep it handy — the app will ask for it in the first-run tutorial
(or later in Settings).

### 1.4 Run it
Pick a device/emulator with **API 26+** and hit Run. First build will take a few minutes
while Gradle downloads dependencies.

---

## 2. What's implemented

- **Cinematic first-run intro** → language picker (English/한국어, auto-detected from the
  phone, changeable later in Settings) → 3-page feature tutorial → Groq API key entry.
  All transitions use spring/tween animations; tap anywhere to skip the cinematic title card.
- **Home** — pick an emergency scenario (10 categories), your role, and a difficulty slider
  (Beginner/Intermediate/Advanced), then start a session.
- **Chat** — the AI opens the scene automatically, you type responses, animated typing
  indicator while it "thinks," and an **End session** button that asks the AI to break
  character and give you a structured debrief.
- **History** — every session (in-progress or completed) is saved locally via Room and can
  be reopened, deleted individually, or cleared entirely.
- **Settings** — change language, Groq API key, and the model string (in case Groq
  deprecates the default model — see below), replay the tutorial, clear all data.
- **Monochrome theme** that follows the phone's system light/dark mode automatically —
  no manual toggle, no accent colors anywhere, per your spec.
- Smooth spring/tween animations on every button, the difficulty slider, chip selection,
  page transitions, and chat bubbles.

## 3. What's intentionally stubbed for later (per your notes)

- **Voice input** — the chat input is text-only for now. To add voice, the cleanest path is
  Android's `SpeechRecognizer` API feeding into `ChatViewModel.sendMessage()` — the
  ViewModel doesn't care where the text comes from.
- **Google login / cloud sync** — everything is local-only (Room + DataStore). Swapping in
  a backend later mostly means adding a sync layer on top of `ChatDao`; the UI layer won't
  need to change.

## 4. About the Groq model

The default model is `openai/gpt-oss-120b` — Groq's current general-purpose flagship as of
this writing (they retired the old `llama-3.3-70b-versatile` / `llama-3.1-8b-instant`
models earlier in 2026). If Groq changes their lineup again, just update the model string
in **Settings → AI model** — no code change or rebuild needed.

## 5. Project structure

```
app/src/main/java/com/bright/app/
├── data/
│   ├── local/        Room database (sessions + messages)
│   ├── preferences/  DataStore (language, onboarding flag, API key, model)
│   └── remote/        Retrofit/OkHttp client for the Groq chat completions API
├── domain/
│   ├── model/         Language, ScenarioType, TraineeRole, Difficulty, ChatMessage
│   └── ScenarioPromptBuilder.kt   the system prompt that turns the model into a patient
├── ui/
│   ├── onboarding/     cinematic intro + tutorial pager
│   ├── home/           scenario/role/difficulty picker
│   ├── chat/            the roleplay conversation screen
│   ├── history/         saved sessions list
│   ├── settings/
│   ├── components/     shared button/slider/chip/text field styles
│   ├── theme/           monochrome Material3 theme, shared animation specs
│   └── navigation/       Navigation-Compose graph
├── MainActivity.kt
└── BrightApplication.kt   simple manual DI container (no Hilt, keeps the build light)
```

## 6. A couple of things worth knowing before you push to GitHub

- **Don't commit your API key.** It's stored in DataStore on-device, not in source — you're
  safe by default, just don't hardcode one anywhere while testing.
- The Groq key is currently stored in **plaintext DataStore**. That's fine for a personal,
  single-user local project. If you ever ship this publicly, move it into
  `EncryptedSharedPreferences` or the Android Keystore first — there's a note about this
  right above `UserPreferences` in the code.
- `.gitignore` is already set up for a standard Android project (build folders, local.properties,
  `.idea/`, etc.).

## 7. Known rough edges to expect on first run

- Changing the language triggers a full Activity recreation (this is how Android's
  per-app language API works, not a bug) — you'll see a brief flash, which is normal.
- There's no retry/backoff on network errors beyond the manual "Retry" button in chat —
  fine for personal use, worth hardening if you ever have real users.
