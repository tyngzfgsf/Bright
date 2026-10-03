# Bright — Android app

AI medical-emergency drill trainer. Kotlin + Jetpack Compose, an OpenAI-compatible LLM (via Supabase Edge Functions) for the AI,
Room for local storage, DataStore for prefs. Package `com.bright.app`, minSdk 26.

## Repo structure (important — two separate GitHub repos)

- **Source code** (this repo): `tyngzfgsf/Bright` — private.
- **APK releases**: `tyngzfgsf/Bright-app` — public. CI pushes built APKs here on every
  version tag; there is no source code in this repo, only release binaries.
- Tagging `vX.Y` on this repo triggers `.github/workflows/release-apk.yml`, which builds
  and pushes the APK to `Bright-app`'s releases page.

## Build & release workflow

```bash
./gradlew clean assembleDebug   # ALWAYS use clean, not just assembleDebug — see gotcha below
git add . && git commit -m "..."
git push
git tag vX.Y
git push origin vX.Y
```

If `git push` is rejected ("fetch first"), someone (usually me, editing via GitHub's web
UI) pushed something I don't have locally. Run `git fetch origin && git log HEAD..origin/main --oneline`
to see what, then `git pull --rebase origin main` before retrying — don't force-push over it blind.

If a tag needs to be redone after a fix: `git tag -f vX.Y && git push origin vX.Y --force`.

## Hard-won gotchas

1. **`./gradlew assembleDebug` (no `clean`) can pass locally while CI fails on the exact
   same commit.** Local incremental compilation can skip re-checking files that haven't
   changed, silently hiding real compile errors (this happened with an `@ExperimentalMaterial3Api`
   opt-in issue in `NavGraph.kt` that only surfaced on CI's clean checkout). Always run
   `./gradlew clean assembleDebug` before tagging a release.

2. **Experimental Compose Material3 APIs: use `@OptIn(...)`, never the bare marker
   annotation** (e.g. `@androidx.compose.material3.ExperimentalMaterial3Api`) on any
   function that something else calls (like `BrightNavGraph`, called from `MainActivity`).
   The bare marker propagates the opt-in requirement to every caller, which breaks callers
   that don't also opt in. `@OptIn(...)` contains it locally.

3. **`ExposedDropdownMenuBox`'s API has been actively churning across recent Compose
   Material3 releases.** Prefer the plain, long-stable `DropdownMenu` + `DropdownMenuItem`
   primitives for any tap-to-pick dropdown instead — see `ModelDropdown` in
   `ui/settings/SettingsScreen.kt` for the pattern.

4. **Firebase config snippets pasted from the console include npm-style boilerplate**
   (`import { initializeApp } from "firebase/app"`) that breaks the site's plain
   browser-ESM setup. Only the `firebaseConfig = { ... }` object itself should be pasted
   into `js/firebase-config.js` — strip the import/init lines around it.

5. The companion **website** lives in a separate folder (`bright-site/`, deployed via
   Firebase Hosting to project `bright-34c23`) — not part of this Gradle project, no
   shared build.

## Product direction (why features exist)

The core bet: a generic AI chatbot can already roleplay a medical scenario, so that's not
a moat. The moat is what accumulates on top of it:
- **Skill profile** (`domain/SkillProfile.kt`): per-scenario-type average score, trend,
  and a "weakest area" pick, surfaced on Home as a one-tap drill card and in full on the
  Stats screen. This is the actual differentiator — session 50 is more useful than
  session 1 because of this, which a plain chatbot can't replicate.
- AI calls go through Supabase Edge Functions (`supabase/functions/`); users sign in and
  chat, and never see or enter an API key (the BYOK flow is being removed).
- Not charging yet; priority is adoption. Possible future pivot to AI job-interview
  practice using the same scenario→answer→score engine, currently deprioritized in favor
  of a narrower, underserved niche (Korean 국가고시 / KTAS-aligned emergency training).

## Delivery conventions (for humans pasting into Terminal — less relevant once Claude Code is doing this directly)

- Full-file replacements (`cat > path << 'EOF' ... EOF'`) are safer than `sed` or partial
  edits for anything with special characters — zsh chokes on unescaped `<` from XML/HTML
  pasted directly into the terminal.
- `strings.xml` always gets replaced as a complete file for both `values/` and `values-ko/`
  together, never partial edits — easy to lose sync between languages otherwise.

## Security rules (backend: Supabase + LLM provider) — do not weaken

1. The LLM API key (`LLM_API_KEY`; provider/model via `LLM_BASE_URL`, `LLM_MODEL_CHAT`,
   `LLM_MODEL_GRADE`) exists ONLY as a Supabase Edge Function secret (`supabase secrets set`).
   Never in the repo, git history, `BuildConfig`, Compose resources, shipped
   `local.properties`, website JS, logs, error messages, or chat. Never ask for a key in chat.
2. Clients hold only the Supabase **anon** key and the user's session. The **service role**
   key is used only inside Edge Functions and never leaves the server.
3. Every Edge Function requires a valid user JWT, verified server-side; `user_id` comes from
   the token, never from the request body.
4. RLS is ON for every table. Clients read only their own rows. All writes to usage/quota
   tables happen in Edge Functions with the service role. No client can change `tier`.
5. The client never chooses model, `max_tokens`, temperature or system prompt. Prompts and
   rubrics live server-side; the client sends only `scenario_id`, `language`, `messages`
   (plus allow-listed enums).
6. Never return raw upstream (LLM provider) error bodies; map to small generic error codes.
7. Never log message content — only user id, token counts, cost, status, latency.
8. Store the Supabase session in secure platform storage (Android Keystore-backed, iOS
   Keychain) — never plain SharedPreferences/UserDefaults/DataStore.
9. Never print environment variables or secrets in command output or summaries.
