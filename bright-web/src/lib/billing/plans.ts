/**
 * The website's copy of Bright's price book — the same plans as the apps
 * (shared/.../domain/billing/Pricing.kt). What a buyer is actually charged comes from Paddle,
 * which localises prices to the visitor's country; these numbers are only the fallback shown
 * until (or unless) Paddle's price preview loads.
 */

export type PlanId = "free" | "plus" | "pro";
export type Period = "monthly" | "annual";
export type AddOn = "addon_drill_pack" | "addon_streak_freezes";

export const PLANS: PlanId[] = ["free", "plus", "pro"];
export const RECOMMENDED: PlanId = "plus";
export const FREE_DRILLS_PER_MONTH = 10;
export const PLUS_TRIAL_DAYS = 7;
export const ANNUAL_MONTHS_FREE = 2;
export const RETENTION_PERCENT = 50;
export const RETENTION_MONTHS = 3;
export const DRILL_PACK_SIZE = 20;
export const STREAK_FREEZE_PACK_SIZE = 3;

type Currency = { code: "ZAR" | "KRW" | "USD"; locale: string; minor: number };
const CURRENCIES: Record<string, Currency> = {
  ZA: { code: "ZAR", locale: "en-ZA", minor: 100 },
  KR: { code: "KRW", locale: "ko-KR", minor: 1 },
  US: { code: "USD", locale: "en-US", minor: 100 },
};

/** Monthly prices in minor units; annual is 10× ("2 months free"). Mirrors Pricing.kt. */
const MONTHLY: Record<Exclude<PlanId, "free">, Record<Currency["code"], number>> = {
  plus: { ZAR: 4900, KRW: 3500, USD: 299 },
  pro: { ZAR: 9900, KRW: 7900, USD: 599 },
};
const ADD_ONS: Record<AddOn, Record<Currency["code"], number>> = {
  addon_drill_pack: { ZAR: 2500, KRW: 2000, USD: 129 },
  addon_streak_freezes: { ZAR: 1500, KRW: 1000, USD: 79 },
};

/** The visitor's currency from their browser region — only for the fallback prices. */
export function fallbackCurrency(): Currency {
  if (typeof navigator === "undefined") return CURRENCIES.US;
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  return CURRENCIES[region] ?? CURRENCIES.US;
}

function format(minor: number, c: Currency): string {
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    maximumFractionDigits: c.minor === 1 || minor % c.minor === 0 ? 0 : 2,
  }).format(minor / c.minor);
}

export function fallbackPrice(plan: Exclude<PlanId, "free">, period: Period, c = fallbackCurrency()) {
  const monthly = MONTHLY[plan][c.code];
  const total = period === "annual" ? monthly * 10 : monthly;
  // Rounded down, so the per-month figure never overstates the saving.
  const perMonth = period === "annual" ? Math.floor(total / 12) : total;
  return { total: format(total, c), perMonth: format(perMonth, c) };
}

export function fallbackAddOnPrice(addOn: AddOn, c = fallbackCurrency()) {
  return format(ADD_ONS[addOn][c.code], c);
}

export function zeroPrice(c = fallbackCurrency()) {
  return format(0, c);
}

/** "plus_annual" — the key Paddle price ids are configured under, and the apps' package id. */
export function priceKey(plan: Exclude<PlanId, "free">, period: Period) {
  return `${plan}_${period}` as const;
}
