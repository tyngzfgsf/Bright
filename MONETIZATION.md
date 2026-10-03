# Bright — pricing, subscriptions & monetization

One Bright account, three places to pay: **Google Play** (Android), the **App Store**
(iPhone — not wired yet, see below) and the **website**. Whatever someone buys, wherever,
unlocks Bright everywhere they sign in.

**Nothing here is live until you deploy and configure it.** With no keys set, every build
works and the paywall says purchases aren't available yet.

## The offer

| | Free | **Plus** ("Most popular") | Pro |
|---|---|---|---|
| Outcome line | Build the daily habit | Train every day, on any case, with no limits | Know exactly what to fix after every case |
| Hosted AI drills | 10 / month | Unlimited (300/month fair-use ceiling, never shown) | Unlimited |
| Custom scenarios / AI roles | — | ✓ | ✓ |
| Expert debrief after a case | — | — | ✓ |
| Streak freezes | buy | buy | 3 / month included |
| Free trial | — | 7 days | — |
| Monthly (reference) | — | **R49 / ₩3,500 / $2.99** | R99 / ₩7,900 / $5.99 |
| Annual (10× = "2 months free") | — | R490 / ₩35,000 / $29.90 | R990 / ₩79,000 / $59.90 |

Add-ons: **+20 drills** (R25 / ₩2,000 / $1.29; only offered where drills are capped) and
**3 streak freezes** (R15 / ₩1,000 / $0.79). Exit offer: **50% off for 3 months**, once per
account, shown before any cancellation.

Each store charges its own prices, snapped to its price tiers. Enter the reference prices above
as closely as the tiers allow. The paywalls show the store's or Paddle's own localized price
once loaded. Two rules are tests, not conventions (`shared/src/commonTest/.../PricingTest.kt`):
the entry plan stays **≤ US$3/month** (checked at pessimistic exchange rates), and there are
**never more than 3 plans**. **The stores' real prices aren't tested, so keep them inside the
same rule when you set them.**

A *drill* is one practice case. The first AI turn carrying a new drill id spends one; later turns
in that case don't. People using **their own Groq key are never metered**.

## How it fits together

```
            ┌──── Android (Play build) ── RevenueCat SDK ── Google Play Billing
 buy  ──────┼──── iPhone ─────────────── (not yet — see "iOS")
            └──── website / GitHub APK ── Paddle Checkout (overlay on bright-web)

 RevenueCat ── webhook ──┐
 Paddle ────── webhook ──┼──▶ bright-proxy (Cloudflare Worker) ── Account Durable Object per uid
                         │         plan from every source · monthly drills · credits · emails
 every client ── GET /v1/account ──┘      POST /v1/turn (Groq, metered per drill)
```

- **bright-proxy is the only thing that grants a plan.** It re-reads RevenueCat's subscriber or
  Paddle's subscription on every webhook, so out-of-order events can't win. The apps' cached plan
  is display-only. Every hosted turn is re-checked server-side.
- **No Firebase Blaze needed.** Everything runs on the Workers free plan (SQLite-backed Durable
  Objects). Firebase is still used only for Auth (free).
- **Which build sells how:**
  - **GitHub APK** (`-Pdistribution=github`, the default). Play Billing can't work in a sideloaded
    install, so the paywall's button opens the website's pricing page. Same account, same plan.
  - **Google Play build** (`-Pdistribution=play -PrevenueCatAndroidKey=goog_…`). Play Billing via
    RevenueCat; never links to outside payment, which Play's policy forbids.
- **Cancelling.** Website plans cancel (or take the exit offer) through bright-proxy, from any
  device. Store plans can only be cancelled in Google Play / App Store settings: the app shows the
  exit offer first, then opens the store's subscription page.
- **Dunning.** Google Play's grace period / account hold, and Paddle's automatic retries, keep
  retrying failed renewals. Meanwhile the trainee keeps access (status `PAST_DUE`), gets an email,
  and sees an "Update payment" button that opens the right place.
- **Emails** (trial ends in 3 days; payment failed) go out from bright-proxy through
  [Resend](https://resend.com), in English or Korean, deduplicated.

| Checklist item | Where |
|---|---|
| Google Pay | Inside Google Play Billing in the Play build. Offered by Paddle's checkout on the website |
| Apple Pay | Offered by Paddle's checkout on the website (Safari). In the iPhone app it will come with App Store IAP |
| Pricing inside the app | `shared/.../ui/billing/PaywallScreen.kt`. Website: `bright-web/.../pages/PricingPage.tsx` |
| Failed-payment retries | Stores + Paddle retry; `PAST_DUE` keeps access; email + "Update payment" (`PlanSection.kt`, `AccountPage.tsx`) |
| Annual discount / monthly equivalent | Period toggle, "R40.83/month, billed annually (R490)" |
| Outcome-led copy | `paywall_*` strings (app, en + ko), `pricing.*` in `bright-web/messages/*.json` |
| Local currency | Store prices are localized by the store; Paddle localizes by visitor country; fallback by device region (ZAR/KRW/USD) |
| One recommended plan / ≤ 3 plans / entry ≤ $3 | `Pricing.kt`, enforced by `PricingTest` |
| Popcorn add-ons | Checkout sheet + Settings (app), checkout + Your plan (web) |
| Exit offer | Web: Paddle discount via `/v1/web/cancel`. Play: `retention`-tagged offer. App Store: promotional offer `retention50` |
| Upgrade prompts | Home drill counter, paywall on Start when out of drills, locked custom scenarios, near-limit nudge, "Expert debrief · Pro" |
| Free cap | 10 hosted drills/month, enforced in `bright-proxy/src/billing/entitlement.ts` |
| Onboarding → aha fast | Google sign-in first → "Your first case takes 2 minutes" → straight into a scored case |
| Trial-ending email | bright-proxy Durable Object alarm, 3 days before any source's trial ends |

## Turning it on

Use test/sandbox mode everywhere first.

### 1. bright-proxy (the backend)
```bash
cd bright-proxy && npm install && npm test        # 18 billing tests, no network
npx wrangler deploy                                # adds the Account Durable Object (migration v2)
npx wrangler secret put RC_SECRET_KEY              # RevenueCat secret API key (sk_…)
npx wrangler secret put RC_WEBHOOK_AUTH            # any long random string; paste the same in RevenueCat
npx wrangler secret put PADDLE_API_KEY
npx wrangler secret put PADDLE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
```
In `wrangler.jsonc` vars, set `PADDLE_ENV`, `PADDLE_PRICES` (Paddle price id → key; the keys are
`plus_monthly`, `plus_annual`, `pro_monthly`, `pro_annual`, `addon_drill_pack`,
`addon_streak_freezes`), `PADDLE_RETENTION_DISCOUNT_ID` and `EMAIL_FROM`.

### 2. Google Play + RevenueCat
1. Publish Bright on Google Play (an internal testing track is enough to start). Play Billing
   needs the app to come from Play.
2. Play Console: subscriptions `bright_plus` and `bright_pro`, each with base plans `monthly` and
   `annual`. On Plus, add a 7-day free-trial offer. On every base plan, add a
   developer-determined offer tagged **`retention`** (50% off, 3 periods). Add consumables
   `addon_drill_pack` and `addon_streak_freezes`. Turn on grace period and account hold.
3. RevenueCat: connect the Play app. Create entitlements **`plus`** and **`pro`**. Create offering
   **`default`** with packages identified **`plus_monthly`, `plus_annual`, `pro_monthly`,
   `pro_annual`**.
4. RevenueCat → Integrations → Webhooks: `https://<bright-proxy>/webhooks/revenuecat`, with the
   Authorization header set to your `RC_WEBHOOK_AUTH` value.
5. Build: `./gradlew clean bundleRelease -Pdistribution=play -PrevenueCatAndroidKey=goog_…`

### 3. Website + Paddle
1. Paddle (sandbox first): products/prices for the four plans (7-day trial on Plus) and both
   add-ons. Create a discount (50%, recurring for 3 billing periods) for the exit offer. Approve
   the website's domain.
2. Notification destination: `https://<bright-proxy>/webhooks/paddle`, with events
   `subscription.*`, `transaction.completed` and `transaction.payment_failed`. Copy its secret
   into `PADDLE_WEBHOOK_SECRET`.
3. Build bright-web with `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV` and
   `NEXT_PUBLIC_PADDLE_PRICES` (JSON, key → `pri_…`), plus the existing `NEXT_PUBLIC_PROXY_URL`.
4. Add the website's origin to bright-proxy's `ALLOWED_ORIGINS` if it changed.

### 4. Emails
Verify a sending domain in Resend, set `RESEND_API_KEY` and `EMAIL_FROM`. Until then, emails are
skipped (logged), and nothing fails.

## iOS (App Store) — not wired yet, and why

The iPhone app builds, but sells nothing yet. `StoreBilling` is `NoStoreBilling` there, and it
doesn't link to the website either (App Store rules). Two things are missing:

1. **Sign-in on iOS.** The iOS app has no Firebase Auth yet (`authService` is null), and plans
   attach to accounts. Note that Apple requires **Sign in with Apple** whenever Google sign-in is
   offered.
2. **An App Store implementation of `StoreBilling`.** The RevenueCat multiplatform SDK this
   project can use (2.x, built with Kotlin 2.1) pins RevenueCat iOS 5.67.1, which **doesn't
   compile on Xcode 27 / Swift 6.4**. Options:
   - Upgrade the project to Kotlin 2.3 and use RevenueCat KMP 3.x. `RevenueCatStoreBilling`
     moves to `commonMain` unchanged, but Compose Multiplatform, Ktor, Room and KSP are all
     version-pinned against Kotlin 2.2, so this is its own migration.
   - Implement `StoreBilling` in Swift with the current RevenueCat iOS SDK and pass it into
     `MainViewController`.

The backend already handles App Store purchases: RevenueCat reports them with `store: app_store`,
and the exit offer uses promotional offer id `retention50`.

## Decisions and non-code steps still open

- **Publish on Google Play** (needed for Play Billing). Then the FAQ's "Is it on the Play
  Store?" answer needs updating.
- **Privacy policy and terms.** A Payments section was added to the website's privacy page, but
  the rest of it still says "no account, no analytics", which was already untrue before billing
  (Firebase Analytics and Google sign-in exist). It needs a real review, and so do the terms (a
  refund policy) and the app's privacy page. Korea and South Africa both have consumer rules on
  auto-renewing subscriptions.
- **Tax.** Paddle handles VAT on the website as merchant of record. Google Play and Apple handle
  it for store sales in most countries. Your own income tax and business registration are yours.
- **Existing users lose custom scenarios** unless they subscribe. Consider a grace period or a
  promo for early users.
- **Exchange-rate drift.** `PricingTest` checks the reference prices only. Re-check store prices
  against the US$3 entry cap when you set them.
