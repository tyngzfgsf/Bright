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
