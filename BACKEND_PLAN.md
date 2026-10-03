# Bright — backend & subscription plan

Goal: remove the BYOK Groq-key wall for normal users by proxying Jason's own key through
a backend, gated by login and a free/paid tier — while keeping BYOK available as a
power-user fallback. This is the prerequisite for monetization, and it's needed
regardless of which client (Android, iOS, web) eventually talks to it — build this
before any web frontend.

**Ground rule, same as the iOS plan: verify each phase before moving to the next, and
commit at each verified checkpoint.** This plan touches money and real user accounts —
treat mistakes here as more expensive than a broken Compose screen, not less.

## Phase 0 — Decide hosting, confirm legal basis

- Backend lives on **Firebase Cloud Functions**, reusing the existing `bright-34c23`
  Firebase project (same one behind the companion site) rather than standing up new
  infrastructure — this needs the **Blaze (pay-as-you-go) plan**, not Spark. Flag this
  plan-upgrade to Jason explicitly before doing it; it's a real, if small, recurring cost
  shift and a deliberate decision point, not a default to make silently.
- Confirmed: Groq's Terms of Sale explicitly permit proxying API access through your own
  "Customer Application" to your own end users. What's prohibited is handing out the raw
  API key/login credentials themselves, or reselling bare API access as a commodity.
  Neither applies here — the key stays server-side, end users only ever interact with
  Bright's own accounts.
- Once real accounts + payments exist, a **privacy policy and terms of service become a
  real requirement**, not optional — flag this to Jason as a to-do even though it's not
  a coding task; don't let it get lost.

## Phase 1 — Auth in the Android app

- Add Firebase Auth (Google Sign-In) to the Android app itself, using the same
  `bright-34c23` project already backing the website.
- This is additive at first: a "Sign in" option appears in Settings alongside the
  existing manual API key field. Nothing about the current BYOK flow breaks or gets
  removed yet.
- Verify: can sign in and out on-device, and the signed-in state persists across app
  restarts.

## Phase 2 — Backend proxy endpoint

- One Cloud Function (e.g. `proxyChatCompletion`) that:
  - Verifies the caller's Firebase auth token (rejects unauthenticated requests)
  - Holds Jason's own Groq key as a Cloud Functions secret (`firebase functions:secrets:set`)
    — **never** in client code, never returned to the client in any response
  - Forwards the request to Groq, returns the response
- No usage limits yet in this phase — the goal is just proving the plumbing: authenticated
  request in, Groq response out, key never exposed.
- Verify: a signed-in Android build can get a real scored response through this endpoint,
  and inspecting the app's network traffic / APK confirms the Groq key never appears
  client-side.

## Phase 3 — Usage metering (free tier)

- A Firestore document per user tracking session count within a reset window (e.g.
  "sessions used this month").
- The Cloud Function checks this before calling Groq; rejects with a clear error once the
  free-tier cap is hit, rather than silently failing.
- Decide and hardcode a concrete free-tier number to start (e.g. 20 sessions/month) —
  a specific number to test against, adjustable later based on real cost data.
- Verify: hitting the cap actually blocks further sessions, and the Android app shows a
  clear message rather than a generic error when that happens.

## Phase 4 — Wire the Android app to prefer the backend

- When signed in, `GroqRepository` calls the backend proxy instead of Groq directly.
- BYOK remains available as a fallback path for anyone who prefers pasting their own key
  — don't remove it, just stop making it the default/only path.
- Update the "Connect your AI first" dialog (from Home) and onboarding's API-key page to
  offer "Sign in" as the primary option, with BYOK demoted to something like "or use your
  own key instead."
- Verify: a fresh install, signed in, with **no Groq key ever entered**, can complete a
  full session end to end.

## Phase 5 — Stripe subscription for the paid tier

- Stripe Checkout (hosted page — avoid building custom payment UI) for a paid
  subscription.
- A webhook updates the user's tier in Firestore on successful payment/cancellation.
- The Cloud Function from Phase 3 checks tier before enforcing the free-tier cap —
  paid users get a higher/no cap.
- Verify with Stripe's test mode before touching real payments.

## Phase 6 — deferred: web frontend

- Only after Phases 1–5 are solid. At that point it's a thin client hitting the same
  backend — auth, proxy, and billing all already proven. Don't start this phase early
  just because "a website" was the original framing of the idea.

## Known constraints going in

- This phase set involves real money and real user data (accounts, payment status) —
  slower and more cautious than the iOS work is the right instinct, not overcaution.
- The Groq key must never reach the client at any point, in any phase — that's the one
  invariant every phase after Phase 2 depends on.
- Moving to Firebase Blaze is a real cost decision — confirm with Jason before doing it,
  don't treat it as an implementation detail.
