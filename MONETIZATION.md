# Bright — pricing, subscriptions & monetization

What's built, how to switch it on, and what still needs a human decision. This finishes
BACKEND_PLAN.md Phases 3–5 (metering, hosted-by-default, payments) — read that first for the
why behind the backend.

**Nothing here is live until you deploy it.** The code builds and runs with billing switched
off: no Stripe key means the paywall shows prices but says purchases aren't available.

## The offer

| | Free | **Plus** (highlighted) | Pro |
|---|---|---|---|
| Outcome line | Build the daily habit | Train every day, on any case, with no limits | Know exactly what to fix after every case |
| Hosted AI drills | 10 / month | Unlimited (300/month fair-use ceiling, never shown) | Unlimited |
| Custom scenarios / AI roles | — | ✓ | ✓ |
| Expert debrief after a case | — | — | ✓ |
| Streak freezes | buy | buy | 3 / month included |
| Trial | — | 7 days, once per account | — |
| Monthly | R0 / ₩0 / $0 | **R49 / ₩3,500 / $2.99** | R99 / ₩7,900 / $5.99 |
| Annual (10× = "2 months free") | — | R490 / ₩35,000 / $29.90 | R990 / ₩79,000 / $59.90 |

Add-ons ("popcorn"): **+20 drills** R25 / ₩2,000 / $1.29 (only offered where drills are capped),
**3 streak freezes** R15 / ₩1,000 / $0.79. Offered as unticked boxes at checkout and in
Settings → Plan & billing.

Exit offer: **50% off for 3 months**, once per account, shown before any cancellation.

Rules enforced by tests (`shared/src/commonTest/.../PricingTest.kt`), not by convention:
- The entry plan never exceeds **US$3/month** in any currency, checked at deliberately
  pessimistic exchange rates (R17/$, ₩1,250/$). If the rand or won strengthens past those,
  the test is the reminder to re-check prices. Don't loosen the rates to make it pass.
- **No more than 3 plans**, exactly one recommended, and it's a paid plan.

Note: the checklist's example "R100/month billed annually" would break its own $3 cap.
Plus works out to **R40.83/month billed annually**.

### BYOK (own Groq key) users

Unmetered, because they pay Groq themselves. Plan features (custom scenarios, expert
debrief) are still gated by plan. A BYOK user who wants unlimited *hosted* drills (no key)
still needs Plus.

## How the pieces fit

```
App ── startHostedDrill ──▶ Cloud Function ── checks/increments users/{uid} (transaction)
 │                                             └─ issues drills/{id} ticket
 └── proxyChatCompletion + drill_id ──▶ verifies ticket owner/age/turns ──▶ Groq (hosted model)

App ── createSubscriptionCheckout ──▶ Stripe subscription (default_incomplete)
 └── PaymentSheet (Google Pay / card) confirms in-app
Stripe ── webhook ──▶ stripeWebhook ──▶ users/{uid}.plan/status   ◀── getBillingStatus ── App
```

- **The webhook is the only thing that grants a plan.** The app's cached entitlement is
  display-only. The server re-checks the plan on every drill.
- **Firestore rules** now make `users/{uid}` read-only to its owner. Before, clients could write
  it, which would have let a modified APK give itself Pro. **Deploy the rules together with the
  functions.**
- Hosted drills always use `openai/gpt-oss-120b`, whatever the client sends. The Settings model
  picker only affects BYOK.

| Checklist item | Where |
|---|---|
| Google Pay | `app/.../billing/StripePaymentLauncher.kt` (PaymentSheet + `GooglePayConfiguration`), manifest `wallet.api.enabled` |
| Apple Pay | **Not wired.** See "iOS" below |
| Pricing inside the app | `shared/.../ui/billing/PaywallScreen.kt`, route `paywall/{reason}` |
| Dunning / failed-payment retry | Stripe Smart Retries (dashboard) + `invoice.payment_failed` email + past-due banner with one-tap "Update payment" (`retryFailedPayment`). Past-due keeps access during retries |
| Annual discount | `Pricing.ANNUAL_MONTHS_CHARGED = 10`, "Get 2 months free" toggle |
| Outcome-led copy | `paywall_*_outcome` / `_bullet_*` strings (en + ko) |
| Local currency | `Currency.forCountry` ← network/SIM country (`app/.../util/RegionCountry.kt`); charged in that currency via Stripe `currency_options` |
| Monthly equivalent | `Pricing.monthlyEquivalent`, "R40.83/month, billed annually (R490)" |
| One recommended plan | `Pricing.RECOMMENDED_PLAN`, inverted card + "Most popular" badge |
| Entry ≤ $3 | Plus R49 / ₩3,500 / $2.99, enforced by test |
| Popcorn add-ons | `AddOn`, checkout sheet + Settings |
| ≤ 3 plans | `Pricing.PLANS`, enforced by test |
| Exit offer | `PlanSection.kt` → `cancelSubscription(acceptRetentionOffer)` |
| Upgrade prompts | Home drill counter, Start → paywall when out, locked custom-scenario field, near-limit nudge after a case, "Expert debrief · Pro" button |
| Free plan cap | 10 hosted drills/month, enforced server-side (`billing/entitlements.js`) |
| Onboarding → aha fast | Language → Google sign-in (key optional) → "Your first case takes 2 minutes" → straight into a scored beginner case |
| Trial-ending email | `customer.subscription.trial_will_end` (3 days before) → `mail` collection → Trigger Email extension. Copy also promises it in the paywall |

## Turning it on (in order, test mode first)

1. **Decide on Blaze.** Cloud Functions need the pay-as-you-go plan. This is BACKEND_PLAN.md's
   standing "confirm with Jason first" item, and it's still your call. Nothing has been upgraded.
2. **Check that Stripe supports your business's country** at stripe.com/global before anything
   else. Stripe has historically **not** supported Korea-registered businesses. If yours is
   Korean, the options are a supported-country entity, a merchant of record (e.g. Paddle,
   Lemon Squeezy), or a Korean PG such as Toss Payments / PortOne. Only `FirebaseBillingService`,
   `StripePaymentLauncher` and `billing/stripe.js` would change; everything above them is
   provider-neutral.
3. Create the Stripe catalog:
   ```bash
   cd bright-site/functions && npm install
   STRIPE_SECRET_KEY=sk_test_... npm run setup-stripe
   ```
4. Set function secrets:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY        # sk_test_… first
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # from step 6
   ```
5. Deploy functions **and rules** together: `firebase deploy --only functions,firestore:rules`
6. Stripe Dashboard → Developers → Webhooks → add
   `https://us-central1-bright-34c23.cloudfunctions.net/stripeWebhook` with events:
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.trial_will_end`,
   `invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded`.
7. Dunning: Dashboard → Settings → Billing → **Subscriptions and emails**:
   - Smart Retries on (e.g. 4 retries over 2 weeks).
   - After the final retry: **cancel the subscription** (the webhook then moves them to Free).
   - Optionally also turn on Stripe's own "send emails about expiring cards".
8. Emails: install the **Trigger Email from Firestore** extension
   (`firebase ext:install firebase/firestore-send-email`), collection `mail`, with an SMTP
   provider. Until then, emails queue unsent and nothing fails.
9. Build with the publishable key:
   ```bash
   ./gradlew clean assembleDebug -PstripePublishableKey=pk_test_... -PstripeMerchantCountry=US
   ```
   For CI, set repo **variables** `STRIPE_PUBLISHABLE_KEY` and `STRIPE_MERCHANT_COUNTRY`.
   `pk_live_` keys switch Google Pay to production automatically.
10. Test with Stripe test cards (`4242…`, and `4000 0000 0000 0341` to exercise dunning) and
    `stripe trigger customer.subscription.trial_will_end`.

Metering tests (Firestore emulator, no Stripe): `cd bright-site/functions && npm test`.

## Things that need your decision or a non-code step

- **Privacy policy, terms and a refund policy** are now required (BACKEND_PLAN.md flagged this).
  Both Korea and South Africa have consumer-protection rules on subscriptions (clear
  cancellation, auto-renewal notice). The trial email and "cancel anytime" copy help, but they're
  not legal review.
- **Tax.** Selling digital services into South Africa and Korea can trigger VAT registration for
  foreign sellers. Look at Stripe Tax, or a merchant of record, which handles it for you.
- **iOS / Apple Pay.** Not wired, on purpose. For digital subscriptions in an App Store app,
  Apple requires In-App Purchase (StoreKit), and Apple Pay via Stripe isn't allowed for this.
  iOS gets `billingService = null` and the paywall says purchases aren't available. When iOS
  ships, add a StoreKit `PaymentLauncher` + server receipt validation.
- **If Bright moves to Google Play**, the same rule applies there: Play Billing replaces Stripe
  for in-app digital subscriptions. Today's GitHub-APK distribution doesn't have that rule.
- **Existing users lose custom scenarios** unless they subscribe. That's the checklist's
  "upgrade prompt on key features", but it's a change for people who had it free. Consider
  grandfathering early users (e.g. a coupon) before release.
- **Voice mode** (`app/.../VoiceModeScreen.kt`) isn't reachable from any screen, so it wasn't
  used as a Pro perk. If it gets wired up, it's a natural Pro feature: add a `Feature` entry.
- Stripe Android is pinned to **22.8.1**. 23.x needs compileSdk 36 / AGP 8.9.1+. Upgrade them
  together.
