# Manual steps for Jason

Run these yourself. Never paste a key into chat, a commit, or a file in this repo.

## 1. Create and link the Supabase project
```bash
brew install supabase/tap/supabase        # CLI (Docker needed only for `supabase start`)
supabase login
# Dashboard: New project (region: Northeast Asia / Seoul). Note the project ref and set a DB password.
supabase link --project-ref <PROJECT_REF>
```

## 2. Apply schema and seed
```bash
supabase db push                           # applies supabase/migrations/*
# Seed example scenarios (once, via SQL editor, or):
psql "<SESSION_POOLER_CONNECTION_STRING>" -f supabase/seed.sql
```

## 3. Secrets (the LLM API key lives ONLY here)
Create an API key with your provider (default: OpenRouter, openrouter.ai/keys), then:
```bash
supabase secrets set LLM_API_KEY=...                      # type it into your own terminal
supabase secrets set LLM_BASE_URL=https://openrouter.ai/api/v1   # optional: this is the default
supabase secrets set LLM_MODEL_CHAT=openai/gpt-oss-20b    # optional: this is the default
supabase secrets set LLM_MODEL_GRADE=openai/gpt-oss-20b   # optional: this is the default
supabase secrets set ALLOWED_ORIGINS=https://bright-34c23.web.app,https://bright-34c23.firebaseapp.com
supabase secrets set DAILY_BUDGET_USD=0.30
supabase secrets list                                      # shows names only
```
Any OpenAI-compatible `/chat/completions` provider works: change `LLM_BASE_URL` (must be https), the key and the model ids.
Optional secrets: `LLM_PRICE_INPUT_PER_M`, `LLM_PRICE_CACHED_INPUT_PER_M`, `LLM_PRICE_OUTPUT_PER_M` (USD per 1M tokens, used for models without an `app_config` price) and `LLM_EXTRA_BODY` (JSON object merged into every request, e.g. `{"provider":{"sort":"price"}}`; it can never override model, messages or limits).

**Set real prices — the seeded price is only a conservative placeholder.** The budget kill switch is only as accurate as these numbers. Take them from your provider's model page and run in the SQL editor:
```sql
update public.app_config set value = value || jsonb_build_object('openai/gpt-oss-20b',
  '{"input": 0.00, "cached_input": 0.00, "output": 0.00}'::jsonb) where key = 'prices';  -- fill in real USD per 1M tokens
```
If the provider reports a per-request cost (OpenRouter returns `usage.cost`), the server uses that instead of the computed figure.
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` and `SUPABASE_JWKS` are injected into Edge Functions automatically; do not set them. The functions use only `SUPABASE_SECRET_KEYS` (database access) and `SUPABASE_JWKS` (user-token verification). They never read the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
Add your custom domain to `ALLOWED_ORIGINS` if you have one (comma-separated, exact origins, no trailing slash).

## 4. Deploy the functions
```bash
supabase functions deploy chat
supabase functions deploy grade
```
Both have `verify_jwt = false` in `supabase/config.toml` on purpose: each function verifies the user's access token itself against `SUPABASE_JWKS` (ES256/RS256/EdDSA only) before doing anything else, so there is one tested verification path. Do not add `--no-verify-jwt` flags or change this without re-running the Deno tests.

## 4b. Smoke test (create a test user, then run the script)

**Create the test user** (a throwaway email/password account; the app itself uses Google sign-in):
1. Dashboard -> Authentication -> Providers -> **Email**: make sure it is enabled (you can turn it off again after testing).
2. Dashboard -> Authentication -> Users -> **Add user -> Create new user**. Enter an email such as `smoke-test@yourdomain.com`, a long random password, and tick **Auto Confirm User** (otherwise sign-in fails with "email not confirmed"). Save the password in your password manager, not in the repo.
3. A `profiles` row is created automatically for the new user (database trigger), with tier `free` and `age_confirmed = false`, so the first chat call would return `age_required`. Dashboard -> **SQL Editor**, run (change the email):
```sql
update public.profiles
   set age_confirmed = true, age_confirmed_at = now()
 where id = (select id from auth.users where email = 'smoke-test@yourdomain.com');

select p.id, p.tier, p.age_confirmed from public.profiles p
  join auth.users u on u.id = p.id where u.email = 'smoke-test@yourdomain.com';   -- expect: free | true
```

**Run it** from the repo root, with the values typed into your own terminal (nothing is saved to a file; prefix the `export` lines with a space, or use `read -s`, to keep the password out of shell history):
```bash
export SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."      # publishable key only; the script refuses sb_secret_ keys
export SMOKE_EMAIL="smoke-test@yourdomain.com"
read -rs SMOKE_PASSWORD && export SMOKE_PASSWORD            # type the password, press Enter
scripts/smoke-test.sh
```
It signs in, picks the first `en` scenario (set `SMOKE_LANGUAGE=ko` or `SMOKE_SCENARIO_ID=<uuid>` to override), sends one short message, and prints the HTTP status, whether the reply streamed (SSE chunks and timing), and the remaining daily messages. It also calls `chat` with no token, a junk token and the publishable key used as a token, and requires 401 for all three. Exit code 0 means everything passed. Each run spends 1 of the test user's 15 daily messages.

Typical failures: `age_required` (run the SQL above), `upstream_error` (check `LLM_API_KEY`, `LLM_BASE_URL`, model secrets and the function logs in the dashboard), `unauthenticated` for the valid token (check that asymmetric JWT signing keys are enabled and `SUPABASE_URL` is right), `budget_reached` / `daily_limit` (expected when the limits are hit).
When you are done testing you can delete the user (Authentication -> Users) and turn the Email provider off.

## 5. Google sign-in (Supabase Auth)
1. Google Cloud Console -> APIs & Services -> Credentials -> Create **OAuth client ID**:
   - **Web application** (used by Supabase and the website). Authorized redirect URI:
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - **Android** client (package `com.bright.app` + your release and debug SHA-1) — needed for the app's native Google sign-in.
2. Supabase Dashboard -> Authentication -> Providers -> Google: enable, paste the **Web** client ID and secret.
   For the Android native flow, also add the Android client ID under "Authorized Client IDs".
3. Authentication -> URL Configuration:
   - Site URL: `https://bright-34c23.web.app`
   - Redirect URLs: `https://bright-34c23.web.app/account.html`, `https://bright-34c23.firebaseapp.com/account.html`, `http://localhost:3000/account.html`
4. Authentication -> Sign In / Providers: turn **off** anonymous sign-ins; keep email sign-up as you prefer.

## 6. Website values (public by design)
Edit `bright-site/js/supabase-config.js`: set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (Dashboard -> Project Settings -> API Keys -> **Publishable key**, `sb_publishable_...`). NEVER a secret key (`sb_secret_...`) or a legacy `service_role` key; Supabase also blocks secret keys in browsers, but don't rely on that. Then `firebase deploy --only hosting` from `bright-site/`.

## 6b. Move off the legacy keys
Dashboard -> Project Settings -> API Keys: create the publishable and secret keys if they don't exist, check that JWT signing keys (asymmetric) are enabled under JWT Keys, then **disable the legacy anon / service_role keys** once the app and site use the new ones. Supabase does not revoke them automatically, and they are deprecated.
The app (later) takes the publishable key via `local.properties` / CI secret, never a secret key.

## 7. Spend protection
- At your provider (OpenRouter: Keys page -> set a **credit limit** on this key, and keep only a small credit balance): cap spend at about $10/month.
- Keep `DAILY_BUDGET_USD=0.30` (about $9/month worst case). The kill switch stops *all* users for the rest of the Seoul day once reached.
- To change a user's tier (no payments yet): SQL editor -> `update public.profiles set tier = 'pro' where id = '<uuid>';`
- To change models/limits/prices without redeploying: edit `public.tiers` / `public.app_config`.

## 8. Rotate anything that was ever committed
- Secret scan found **no real API key** in the working tree or git history (only a `gsk_...` placeholder on the old BYOK key page).
- Firebase web API keys (`AIza...`) are in `app/google-services.json` and `bright-site/js/firebase-config.js`: these are public identifiers, but restrict them in Google Cloud Console -> Credentials (Android package + SHA-1; HTTP referrers for the web key).
- If you ever pasted a real provider key anywhere (old Firestore `users/*` documents hold users' own BYOK keys): ask those users to rotate theirs, then delete those documents.

## 9. Local testing
```bash
supabase start                 # needs Docker
supabase db reset              # migrations + seed
cd supabase/functions && deno test --allow-net --allow-env --allow-read
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_and_quota.sql
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/parallel_quota.sh
```
For an end-to-end run with a fake provider, put `LLM_API_KEY=fake` and `LLM_BASE_URL=http://host.docker.internal:<port>/v1` in `supabase/.env.local` (git-ignored) and `supabase functions serve --env-file supabase/.env.local`.

## 10. Legal to-dos (not code)
Privacy policy + terms (user messages are sent to your LLM provider and the model host it routes to); confirm the minimum age with your lawyer (Korea: 14 under PIPA; EU member states can require up to 16).

## 11. Patient-state simulation engine (Prompt 1)
Details: `docs/PATIENT_STATE_ENGINE.md`. In this order:

1. **Apply the two new migrations** (never edit old ones): `supabase db push` (adds `sessions`, `scenarios.sim`, the session functions, rubric tags). Then Dashboard -> Advisors -> Security: confirm no new warnings and that `sessions` shows RLS enabled.
2. **Seed the two worked scenarios (inserted INACTIVE)**:
   ```bash
   psql "<SESSION_POOLER_CONNECTION_STRING>" -f supabase/seed_sim.sql
   ```
   Safe to re-run: it refreshes the content and never flips `active`. After editing `supabase/scenarios/*.json`, regenerate with `deno run --allow-read --allow-write scripts/gen-sim-seed.ts`.
3. **Optional cheaper classifier**: `supabase secrets set LLM_MODEL_CLASSIFY=<a small, cheap model id>` (type it in your own terminal; if unset, the chat model is used).
4. **Deploy all three functions** (shared code changed): `supabase functions deploy chat grade sim`. `sim` has `verify_jwt = false` in `config.toml` on purpose, like the others.
5. **Check real prices** (step 3 above): a turn is now two calls, so wrong prices make the budget kill switch twice as wrong.
6. **Medical review (blocks release)**: give `supabase/scenarios/anaphylaxis-sim.json` and `asthma-sim.json` to a clinician. Every number and rule is a fictional placeholder and no dose is verified. Only after sign-off: edit the JSON (`review.status` -> `reviewed`, drop "[needs medical review]" from the titles and the note), regenerate, re-apply the seed, then `update public.scenarios set active = true where slug in ('anaphylaxis-sim','asthma-sim');`. Until then the scenarios are invisible to users.
7. **Smoke-test `sim` on a project with no real users** (activation is global, so do this before launch or flip `active` back right after): temporarily activate one scenario, get a user token as in step 4b, then
   ```bash
   curl -s -X POST "$SUPABASE_URL/functions/v1/sim" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
     -d '{"action":"start","scenario_id":"<uuid from scenarios>","language":"en"}'
   ```
   then a `turn` with the returned `session_id`. Deactivate again afterwards. (`scripts/smoke-test.sh` only covers `chat` for now.)
8. **Not done here (needs your decision / the sign-in work)**: the app does not call `sim` yet. `ChatViewModel.onEngineState(...)` and the monitor panel are ready; wiring needs the Supabase sign-in + secure session storage (rule 8) and BYOK removal.
9. **Optional data hygiene**: sessions are never deleted automatically. If you want a retention window: `delete from public.sessions where updated_at < now() - interval '30 days';` as a scheduled job.
10. **Run the local tests** once: `scripts/run-sql-tests.sh` (needs Postgres binaries, `brew install postgresql@17`) and `cd supabase/functions && deno test -A`.
