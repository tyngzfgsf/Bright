/**
 * Shared shapes for Bright's billing. One account per Firebase uid, fed by three payment
 * systems — Google Play and the App Store (both via RevenueCat) and the website (Paddle) — and
 * read by every client through GET /v1/account.
 *
 * The numbers mirror shared/.../domain/billing/Pricing.kt in the app. Charge amounts are not
 * here: Play Console, App Store Connect and Paddle each hold their own prices.
 */

export const FREE_DRILLS_PER_MONTH = 10;
/**
 * "Unlimited" still has a ceiling: every hosted drill costs real Groq money, and a leaked token
 * or scripted client shouldn't be able to run that up without bound. ~10 drills a day.
 */
export const PAID_FAIR_USE_DRILLS_PER_MONTH = 300;
/** Model calls one drill may make: scenario turns, side questions, the debrief. */
export const MAX_TURNS_PER_DRILL = 80;
/** A drill id stops working this long after its first turn. */
export const DRILL_TTL_MS = 12 * 60 * 60 * 1000;

export const PRO_MONTHLY_STREAK_FREEZES = 3;
export const TRIAL_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

export type AddOn = "addon_drill_pack" | "addon_streak_freezes";
export const ADD_ON_CREDITS: Record<AddOn, Credits> = {
  addon_drill_pack: { bonusDrills: 20, streakFreezes: 0 },
  addon_streak_freezes: { bonusDrills: 0, streakFreezes: 3 },
};

export type Credits = { bonusDrills: number; streakFreezes: number };

/** Where a subscription was bought. Exactly one record per source. */
export type Source = "play_store" | "app_store" | "web";

export type Plan = "FREE" | "PLUS" | "PRO";
export type Period = "MONTHLY" | "ANNUAL";
/** Spelled exactly as the app's SubscriptionStatus enum. */
export type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export type Subscription = {
  plan: Exclude<Plan, "FREE">;
  period: Period | null;
  status: Status;
  trialEndsAt: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  discountActive: boolean;
  /** Store product id, or Paddle subscription id for web. */
  reference: string | null;
  /** RevenueCat's management URL for store subscriptions. */
  managementUrl: string | null;
  updatedAt: number;
};

export type DrillRecord = { firstTurnAt: number; turns: number };

export type AccountState = {
  subs: Partial<Record<Source, Subscription>>;
  usage: { month: string; used: number; drills: Record<string, DrillRecord> };
  bonusDrills: number;
  streakFreezesGranted: number;
  trialUsed: boolean;
  retentionOfferUsed: boolean;
  locale: "en" | "ko";
  email: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  /** Recent webhook event ids already applied, for idempotency. Bounded. */
  appliedEvents: string[];
};

export function emptyAccount(): AccountState {
  return {
    subs: {},
    usage: { month: "", used: 0, drills: {} },
    bonusDrills: 0,
    streakFreezesGranted: 0,
    trialUsed: false,
    retentionOfferUsed: false,
    locale: "en",
    email: null,
    paddleCustomerId: null,
    paddleSubscriptionId: null,
    appliedEvents: [],
  };
}

/** What the apps and the website decode — field names match the app's `Entitlement`. */
export type ClientEntitlement = {
  plan: Plan;
  period: Period | null;
  status: Status;
  trialEndsAtMillis: number;
  currentPeriodEndMillis: number;
  cancelAtPeriodEnd: boolean;
  drillsUsed: number;
  drillsLimit: number | null;
  bonusDrills: number;
  streakFreezesGranted: number;
  trialEligible: boolean;
  retentionOfferEligible: boolean;
  discountActive: boolean;
  /** Which payment system manages the active plan — where cancelling has to happen. */
  source: Source | null;
  managementUrl: string | null;
};
