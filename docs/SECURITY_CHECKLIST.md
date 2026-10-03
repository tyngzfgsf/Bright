# Security checklist (status as of the backend + website commits)

Legend: PASS = verified here, PENDING = depends on the Android/KMP client work, FAIL = known gap.

| # | Rule | Status | Evidence |
|---|------|--------|----------|
| 1 | LLM API key only as an Edge secret (`LLM_API_KEY`); never in repo/history/BuildConfig/resources/site/logs/errors | **PARTIAL** | Repo + full git history scanned: no real API key. Functions read `LLM_API_KEY` from env only; base URL must be https; model choice comes from secrets/tiers; logs/errors never include it (tests). The **app still has the BYOK key field until the client change lands** (PENDING). APK/website-bundle grep: site files PASS; APK PENDING. |
| 2 | Client holds only anon key + session; service role only in Edge Functions | **PASS (backend/site)** / PENDING (app) | Site config holds only URL + anon placeholders. `service_role` appears only in `supabase/functions/_shared/store.ts` via env. |
| 3 | Every function verifies the JWT server-side; user id from token | **PASS** | Deno tests: no token, expired token -> 401; body `user_id` is rejected (unknown key); wrong-user test. |
| 4 | RLS on every table; read-own only; usage writes via service role; no tier changes | **PASS** | `tests/rls_and_quota.sql` (2 users, anon, service role) incl. tier update denied; mutation check confirmed the test fails if a hole is opened. |
| 5 | Client never picks model/max_tokens/temperature/system prompt; prompts+rubrics server-side | **PASS** | Unknown keys rejected (`model`, `max_tokens`, `temperature`, `system_prompt`); `system` role rejected; model/tokens come from `tiers`; `scenarios` unreadable by clients (view exposes id/slug/language/title). Note: ask-mode is a bounded explainer prompt, not a general chatbot. |
| 6 | No raw upstream error bodies returned | **PASS** | Test: provider 500/429 and mid-stream error text never appears in the response; only `upstream_error`. |
| 7 | No message content in logs | **PASS** | Test asserts logged entries contain only fn/uid/status/code/latency/tokens/cost and never the message text. |
| 8 | Session in Keystore/Keychain-backed storage | **PENDING** | Not implemented until the client work (current app stores prefs in plain DataStore). |

Other controls: per-minute rate limit (tested), daily quota atomic in SQL (30-connection race test: exactly 5 of 30 admitted), global budget kill switch (tested), CORS allow-list + body size caps (tested), age gate required for `chat`/`grade` (tested).

Known residual risks: budget check is not transactional with the call, so a burst can overshoot by (in-flight requests x one call's cost, well under a cent each); token estimate when the provider omits streaming usage is deliberately pessimistic; a user who clears local data keeps server-side quota (by design).
