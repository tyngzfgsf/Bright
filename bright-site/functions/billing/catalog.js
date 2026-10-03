/**
 * Server-side copy of the price book in shared/.../domain/billing/Pricing.kt.
 *
 * Amounts are NOT here on purpose: what a card is actually charged comes from Stripe Prices,
 * looked up by `lookup_key` (one Price per key, with a `currency_options` entry per currency).
 * This file holds only what the server needs to decide *what* to sell and *who* gets *what*.
 * `scripts/setup-stripe.js` creates the matching Prices; see MONETIZATION.md.
 */

export const CURRENCIES = new Set(["zar", "krw", "usd"]);

export const PLANS = {
  plus: { monthly: "plus_monthly", annual: "plus_annual" },
  pro: { monthly: "pro_monthly", annual: "pro_annual" },
};

export const ADD_ONS = {
  addon_drill_pack: { bonusDrills: 20, streakFreezes: 0 },
  addon_streak_freezes: { bonusDrills: 0, streakFreezes: 3 },
};

/** Hosted drills per calendar month (UTC) on Free. Mirrors Pricing.FREE_DRILLS_PER_MONTH. */
export const FREE_DRILLS_PER_MONTH = 10;

/**
 * "Unlimited" plans still have a ceiling, because every hosted drill costs real Groq money and a
 * leaked account or a scripted client shouldn't be able to run that up without bound. Set far
 * above what a person studying daily would ever hit (~10 drills a day).
 */
export const PAID_FAIR_USE_DRILLS_PER_MONTH = 300;

export const PLUS_TRIAL_DAYS = 7;
export const PRO_MONTHLY_STREAK_FREEZES = 3;

/** Exit offer. Created on first use if missing — see ensureRetentionCoupon. */
export const RETENTION_COUPON_ID = "retain50_3m";
export const RETENTION_PERCENT_OFF = 50;
export const RETENTION_MONTHS = 3;

/** Every lookup key the server ever resolves. */
export const ALL_LOOKUP_KEYS = [
  ...Object.values(PLANS).flatMap((p) => Object.values(p)),
  ...Object.keys(ADD_ONS),
];

/** Inverse of PLANS: lookup_key -> { plan, period }. */
export function planForLookupKey(lookupKey) {
  for (const [plan, periods] of Object.entries(PLANS)) {
    for (const [period, key] of Object.entries(periods)) {
      if (key === lookupKey) return { plan, period };
    }
  }
  return null;
}
