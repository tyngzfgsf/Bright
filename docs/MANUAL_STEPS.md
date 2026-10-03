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
