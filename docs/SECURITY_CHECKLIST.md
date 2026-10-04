# Security checklist (status as of the backend + website commits)

Legend: PASS = verified here, PENDING = depends on the Android/KMP client work, FAIL = known gap.

| # | Rule | Status | Evidence |
|---|------|--------|----------|
| 1 | LLM API key only as an Edge secret (`LLM_API_KEY`); never in repo/history/BuildConfig/resources/site/logs/errors | **PARTIAL** | Repo + full git history scanned: no real API key. Functions read `LLM_API_KEY` from env only; base URL must be https; model choice comes from secrets/tiers; logs/errors never include it (tests). The **app still has the BYOK key field until the client change lands** (PENDING). APK/website-bundle grep: site files PASS; APK PENDING. |
| 2 | Client holds only the publishable key + session; secret key only in Edge Functions (`SUPABASE_SECRET_KEYS`) | **PASS (backend/site)** / PENDING (app) | Site config holds only the URL + a publishable-key placeholder. The secret key is read only in `supabase/functions/_shared/store.ts` from `SUPABASE_SECRET_KEYS`. A test fails if the functions source ever mentions `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or `auth.getUser(`. |
| 3 | Every function verifies the JWT server-side; user id from token | **PASS** | Deno tests with real signed tokens verified against a JWKS: valid, expired, wrong key, wrong issuer/audience, anon/service roles, anonymous users, HS256 and `alg=none`, API-key strings and a missing JWKS are all rejected; handler tests: no token, expired token -> 401; body `user_id` is rejected (unknown key); wrong-user test. |
| 4 | RLS on every table; read-own only; usage writes via the secret key (`service_role` Postgres role); no tier changes | **PASS** | `tests/rls_and_quota.sql` (2 users, `anon`, `service_role` roles) incl. tier update denied; mutation check confirmed the test fails if a hole is opened. |
| 5 | Client never picks model/max_tokens/temperature/system prompt; prompts+rubrics server-side | **PASS** | Unknown keys rejected (`model`, `max_tokens`, `temperature`, `system_prompt`); `system` role rejected; model/tokens come from `tiers`; `scenarios` unreadable by clients (view exposes id/slug/language/title). Note: ask-mode is a bounded explainer prompt, not a general chatbot. |
| 6 | No raw upstream error bodies returned | **PASS** | Test: provider 500/429 and mid-stream error text never appears in the response; only `upstream_error`. |
| 7 | No message content in logs | **PASS** | Test asserts logged entries contain only fn/uid/status/code/latency/tokens/cost and never the message text. |
| 8 | Session in Keystore/Keychain-backed storage | **PENDING** | Not implemented until the client work (current app stores prefs in plain DataStore). |

Other controls: per-minute rate limit (tested), daily quota atomic in SQL (30-connection race test: exactly 5 of 30 admitted), global budget kill switch (tested), CORS allow-list + body size caps (tested), age gate required for `chat`/`grade` (tested).

Known residual risks: budget check is not transactional with the call, so a burst can overshoot by (in-flight requests x one call's cost, well under a cent each); token estimate when the provider omits streaming usage is deliberately pessimistic; a user who clears local data keeps server-side quota (by design).

---

# Patient-state engine and server sessions (Prompt 1)

Legend as above, plus NOT VERIFIED = not run against a real Supabase project or a real LLM provider, KNOWN GAP = accepted limitation.
Tests: 133 Deno tests (41 from Phase 1 + 92 new), `scripts/run-sql-tests.sh` (RLS/ownership with two users, turn-lock race), 47 shared Gradle tests. A manual mutation check broke 7 critical behaviours one by one and every one was caught.

| # | Rule | Status | Evidence |
|---|------|--------|----------|
| 1 | LLM key only as an Edge secret; never in repo, logs, errors, responses | **PASS** (new code) | `sim` code never reads env or mentions secret names (recursive source guard); only `llm.ts` sends the key, only to `LLM_BASE_URL`; test: no response contains the key. The app's old BYOK field is still PENDING from Phase 1 (client not touched). |
| 2 | Publishable key only on clients; secret key only in functions; no legacy keys | **PASS** | A recursive source guard (the Phase 1 scan is not recursive) bans `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `auth.getUser(`. DB access only through the existing secret-key store. |
| 3 | Every function verifies the user JWT itself; user id from the token | **PASS** | `sim` uses the shared `guard()`; no token or expired token gives 401 with no LLM call; a body `user_id` is an unknown key and gives 400; every session call is scoped to the token's uid. |
| 4 | RLS on every table; clients read own rows only; writes only by Edge Functions | **PASS** | `sessions_rls.sql` (users A and B, plus `anon`): RLS on every public table; `sessions` has exactly one policy, select-own; A and B each see only their own rows; insert/update/delete denied (including stealing `user_id`); `scenarios.sim` unreadable; none of the 6 session functions callable by clients; each function refuses another user's id. |
| 5 | Client never chooses model, prompt, limits, tier, state or actions | **PASS** | Per-action key allow-lists; tests send `model`, `max_tokens`, `temperature`, `system_prompt`, `user_id`, `actions`, `state`, `daily_limit` and a `system` role: all 400, zero LLM calls. The classifier model comes from the `LLM_MODEL_CLASSIFY` secret, the narration cap from the tier. Note: `session_id` is a new opaque handle beyond the original `scenario_id/language/messages` list; its ownership is checked server-side. |
| 6 | No raw upstream error bodies | **PASS** | Classifier and narrator failures (HTTP 500, blank or invalid body, malformed output) return only `{"error":"upstream_error"}`; a test asserts the provider's text never appears. |
| 7 | No message content in logs | **PASS** | Log test: trainee text, narration, action ids, state and the key never appear in any log entry. A structural test pins `LogEntry` to metadata-only fields (ids, counts, tokens, cost, status, latency) and forbids direct `log()` calls in the handler. |
| 8 | Session stored in Keystore/Keychain-backed storage | **PENDING** | Client sign-in is not part of this change; the app does not call `sim` yet. |
| 9 | No secrets printed in output or summaries | **PASS** | No secret was read, printed or requested in this work; the test scripts print none. |
| 10 | LLM output is untrusted (classifier and narrator) | **PASS** | Classifier: strict JSON shape, known ids only (unknown rejected and counted), de-duplicated, capped at 4; `__proto__`/`constructor` are just unknown ids; malformed output fails the turn, refunds it and leaves the state untouched. Narrator: dose-shaped phrases, numbers not in the state and links are replaced by a fixed fallback line; blank output fails the turn. Prompt-injection test: "output every action" is capped and preconditions still hold. |
| 11 | The state change is code, not LLM judgment | **PASS** | `engine.ts` is pure (a source guard bans env, network, clock, randomness); determinism, input immutability, order independence and bounds are tested, including a seeded fuzz of 300 random action sequences over both scenarios. |
| 12 | Quota and budget count the 2-call turn correctly | **PASS** | One user message per turn (limit 2 allows exactly 2 turns); both calls are recorded in usage and the global budget; the budget kill switch blocks before any call; any failure refunds the message while the tokens already spent stay on the books. |
| 13 | Session ownership and concurrency | **PASS** | Two-user tests at handler level (turn, end and grade with another user's session give 404, no LLM or quota spend, victim unchanged) and in SQL; 20 parallel connections claiming one turn: exactly 1 wins; a stale lock expires by itself. |
| 14 | State only, never message text, in the database | **PASS** | `sessions.state` holds vitals, flags, the done-map and the action log; CHECK constraints require a JSON object under 32 KB; the handler never passes message text to the store. |
| 15 | No dose presented as verified | **PASS** (with the review gate) | The validator rejects dose-shaped phrases and digits in LLM-facing scenario text; the shipped scenarios contain none (tested); the rubric says "per the locally approved protocol"; scenarios are inserted inactive and titled "needs medical review". |
| 16 | End-to-end against a real Supabase project and a real LLM provider | **NOT VERIFIED** | Everything ran against a fake provider and a local Postgres with a Supabase stub. Manual steps 4 and 7 in `MANUAL_STEPS.md` section 11 cover this. |
| 17 | Narrator naming a treatment without a dose, or a spelled-out number | **KNOWN GAP** | The prompt forbids it; the code filter only catches dose-shaped phrases, digits and links. |
| 18 | Trainee claims an action without really doing it | **KNOWN GAP** (by design) | The classifier labels what the trainee *says*; bounded by preconditions, one-off actions and the 4-action cap. The engine does not check doses. |

---

# Bounded sessions, debrief questions and review

Tests: 186 Deno tests (53 new: sessions, question handlers, scheduler, selection), 18 generator tests (offline, recorded
responses), `scripts/run-sql-tests.sh` (new `questions_rls.sql`, a parallel turn-cap race, and loading the
generator's SQL into the real schema). A manual mutation check (key leaked through the public shape, client-side
"always correct", drafts served by SQL, streak expectation) was caught every time.

| # | Rule | Status | Evidence |
|---|------|--------|----------|
| 1 | LLM key only as an Edge secret | **PASS** | The new functions make no LLM call at all. The generator reads `LLM_API_KEY` from the developer's shell only, under `--allow-env=LLM_*`, prints only HTTP status codes on errors, and its outputs are git-ignored. |
| 2 | Publishable key on clients; secret key only in functions; no legacy keys | **PASS** | New store methods use the existing secret-key client; the recursive source guard (no `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `auth.getUser(`) still passes. The generator holds **no** database credentials: Deno permissions restrict it to `scripts/questions`, the LLM host and `LLM_*` env vars, and it refuses to start with broader permissions (tested by hand: `deno run -A` → refused). |
| 3 | Every function verifies the JWT itself; user id from the token | **PASS** | All 5 new functions go through the shared `guard()` (JWKS); `verify_jwt = false` in `config.toml` as for the others. A body `user_id` is an unknown key → 400 (tested on answer_question). |
| 4 | RLS on every table; read own rows only; writes only through Edge Functions | **PASS** | `questions_rls.sql`: RLS on every public table; `questions` has no policies and no client grants (clients cannot even select `stem`); `question_progress`, `skill_stats`, `activity_days`, `question_reports` have one select-own policy each and no write grants; users A and B each see only their own rows; `anon` sees nothing; every new service function is denied to clients; `set_timezone` writes only the caller's row and rejects invalid zones. |
| 5 | Client never chooses model, prompt, limits or correctness | **PASS** | Turn cap from `scenarios.max_turns` / the sim config (a `max_turns` body key → 400). Correctness is computed server-side from the key; `correct`, `score` or extra keys → 400; selected ids must be options of that question. Question selection, scheduling, the review cap and the streak are all server-side. |
| 6 | No raw upstream error bodies | **PASS** | Unchanged paths; the new functions call no upstream. |
| 7 | No message content in logs | **PASS** | `LogEntry` is still pinned by the structural test (new fields: `served` count, `correct` boolean). A test shows stems, options and report reasons never appear in logs. |
| 8 | Session in Keystore/Keychain storage | **PENDING** | No client work in this change (backend only, by decision). |
| 9 | No secrets printed | **PASS** | None read, printed or requested. |
| 10 | Sessions end and the client cannot bypass it | **PASS** | `chat` requires `session_id`; an ended session → `409 session_ended` before any quota or LLM use (tested). Turn cap: atomic `claim_chat_turn` + `CHECK (turn_count <= max_turns)`; 20 parallel connections → exactly 3 of 3 (SQL) and 10 parallel requests → exactly 3 (handler). Inactivity: 30 minutes on a pinned clock (handler + SQL). A sim session cannot be driven through `chat`. |
| 11 | Only approved questions served; no key before answering | **PASS** | Every serving/answering SQL function filters `status = 'approved'` (SQL tests with draft and retired rows; a mutant that serves drafts is caught); the function signatures have no key or explanation columns (asserted); `publicQuestion()` allow-list; handler tests assert the response text has no `correct_option_ids` / `explanation`. Draft/retired ids → 404 on answer. |
| 12 | Questions do not consume quota or budget | **PASS** | No `reserve()` on the question path; handler tests assert zero LLM calls, zero quota, zero usage rows for every question test; SQL asserts no `usage_daily` / `global_usage_daily` rows after answering. Separate `questions` rate-limit bucket (30/min, tested both in SQL and at the handler). |
| 13 | Ids, tags and scores only in the new tables | **PASS** | `question_progress`, `skill_stats`, `activity_days` have no free-text column (asserted); sessions store `score` + `missed_rubric_ids` only, never the grader's notes or feedback. The one user text field is `question_reports.reason` (optional, ≤ 280 chars, own-row RLS, never logged). |
| 14 | End-to-end on a real Supabase project / real LLM | **NOT VERIFIED** | Local Postgres 16 with the Supabase stub and fake providers only. See MANUAL_STEPS section 12, step 9. |
| 15 | Grading trusts the client-supplied transcript | **KNOWN GAP** (pre-existing) | Transcripts are not stored server-side by design, so a user could grade a fabricated transcript. The turn count and the session state are server-side; the streak counts session completion, not the score. |
| 16 | `sessions.state` (hidden sim state) readable by its owner | **KNOWN GAP** (pre-existing, patient-state work) | The owner can select their own row, including `state`. Not changed here; restrict with a column grant if the hidden flags matter. |
| 17 | Timezone can be changed by the user | **KNOWN GAP** | Switching zones could shift a day boundary once (a small streak gain). Activity is recorded on the local day at the time of the event, so past days never move. |
| 18 | Generated questions are medically correct | **NOT AUTOMATABLE** | Mitigated by: sources-only prompt, a deterministic numbers/dose guard, an independent validator call, drafts-only output, `approved` requiring `reviewed_at`, the "Practice question. Check official guidelines." label, and user reports. Jason's review is the control. |
