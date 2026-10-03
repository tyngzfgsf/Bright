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

## 3. Secrets (the Groq key lives ONLY here)
Create a Groq key at console.groq.com/keys, then:
```bash
supabase secrets set GROQ_API_KEY=...                     # type it into your own terminal
supabase secrets set ALLOWED_ORIGINS=https://bright-34c23.web.app,https://bright-34c23.firebaseapp.com
supabase secrets set DAILY_BUDGET_USD=0.30
supabase secrets list                                      # shows names only
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically; do not set them.
Add your custom domain to `ALLOWED_ORIGINS` if you have one (comma-separated, exact origins, no trailing slash).

## 4. Deploy the functions
```bash
supabase functions deploy chat
supabase functions deploy grade
```
Both have `verify_jwt = true` in `supabase/config.toml` and also verify the user inside the function.

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
Edit `bright-site/js/supabase-config.js`: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Dashboard -> Project Settings -> API -> **anon / publishable** key only. NEVER the service_role key). Then `firebase deploy --only hosting` from `bright-site/`.

## 7. Spend protection
- Groq console -> Settings -> **Limits / spend limit**: set a monthly cap (about $10) if offered.
- Keep `DAILY_BUDGET_USD=0.30` (about $9/month worst case). The kill switch stops *all* users for the rest of the Seoul day once reached.
- To change a user's tier (no payments yet): SQL editor -> `update public.profiles set tier = 'pro' where id = '<uuid>';`
- To change models/limits/prices without redeploying: edit `public.tiers` / `public.app_config`.

## 8. Rotate anything that was ever committed
- Secret scan found **no Groq key** in the working tree or git history (only a `gsk_...` placeholder on the old key page).
- Firebase web API keys (`AIza...`) are in `app/google-services.json` and `bright-site/js/firebase-config.js`: these are public identifiers, but restrict them in Google Cloud Console -> Credentials (Android package + SHA-1; HTTP referrers for the web key).
- If you ever pasted a real Groq key anywhere (old Firestore `users/*.groqApiKey` documents hold users' own keys): ask those users to rotate theirs, then delete those documents.

## 9. Local testing
```bash
supabase start                 # needs Docker
supabase db reset              # migrations + seed
cd supabase/functions && deno test --allow-net --allow-env
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_and_quota.sql
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/parallel_quota.sh
```
For an end-to-end run with a fake Groq, put `GROQ_API_KEY=fake` and `GROQ_BASE_URL=http://host.docker.internal:<port>` in `supabase/.env.local` (git-ignored) and `supabase functions serve --env-file supabase/.env.local`.

## 10. Legal to-dos (not code)
Privacy policy + terms (user messages are sent to Groq); confirm the minimum age with your lawyer (Korea: 14 under PIPA; EU member states can require up to 16).
