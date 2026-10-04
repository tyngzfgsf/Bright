/**
 * Website subscriptions, via Paddle Billing. Paddle is the merchant of record: it sells to the
 * trainee, collects VAT, handles retries of failed payments ("dunning") and pays Bright out.
 *
 * The website opens Paddle Checkout with `customData: { uid }`; Paddle copies that onto the
 * subscription, which is how webhooks find the account. Price ids are mapped to plans with the
 * PADDLE_PRICES var (JSON: { "pri_…": "plus_monthly", … }).
 */

import { ADD_ON_CREDITS, type AddOn, type Credits, PRO_MONTHLY_STREAK_FREEZES, type Subscription } from "./types.ts";

export type PaddleSubscription = {
  id: string;
  status: "active" | "canceled" | "past_due" | "paused" | "trialing";
  customer_id: string;
  custom_data?: { uid?: string } | null;
  items: { price: { id: string }; trial_dates?: { ends_at: string } | null }[];
  current_billing_period?: { starts_at: string; ends_at: string } | null;
  next_billed_at?: string | null;
  scheduled_change?: { action: "cancel" | "pause" | "resume"; effective_at: string } | null;
  discount?: { id: string; ends_at?: string | null } | null;
};

export type PaddleTransaction = {
  id: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  origin?: string;
  custom_data?: { uid?: string; addOn?: string } | null;
  items: { price: { id: string }; quantity: number }[];
  details?: { totals?: { total?: string } } | null;
};

export type PriceMap = Record<string, string>;

const STATUS = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  paused: "CANCELED",
  canceled: "CANCELED",
} as const;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

export function mapSubscription(sub: PaddleSubscription, prices: PriceMap, now: number): Subscription | null {
  const key = prices[sub.items[0]?.price.id ?? ""];
  const match = key?.match(/^(plus|pro)_(monthly|annual)$/);
  if (!match) return null;
  const trialEnd = ms(sub.items[0]?.trial_dates?.ends_at);
  return {
    plan: match[1] === "pro" ? "PRO" : "PLUS",
    period: match[2] === "annual" ? "ANNUAL" : "MONTHLY",
    status: STATUS[sub.status] ?? "NONE",
    trialEndsAt: sub.status === "trialing" ? trialEnd || ms(sub.next_billed_at) : 0,
    currentPeriodEnd: ms(sub.current_billing_period?.ends_at) || ms(sub.next_billed_at),
    cancelAtPeriodEnd: sub.scheduled_change?.action === "cancel",
    discountActive: !!sub.discount && (!sub.discount.ends_at || ms(sub.discount.ends_at) > now),
    reference: sub.id,
    managementUrl: null,
    updatedAt: now,
  };
}

/** Add-ons bought in this transaction, plus Pro's monthly freezes on paid subscription charges. */
export function creditsForTransaction(tx: PaddleTransaction, prices: PriceMap): Credits {
  const credits: Credits = { bonusDrills: 0, streakFreezes: 0 };
  const paid = Number(tx.details?.totals?.total ?? "0") > 0;
  for (const item of tx.items) {
    const key = prices[item.price.id];
    if (key && key in ADD_ON_CREDITS) {
      credits.bonusDrills += ADD_ON_CREDITS[key as AddOn].bonusDrills * item.quantity;
      credits.streakFreezes += ADD_ON_CREDITS[key as AddOn].streakFreezes * item.quantity;
    } else if (paid && key?.startsWith("pro_")) {
      credits.streakFreezes += PRO_MONTHLY_STREAK_FREEZES * (key === "pro_annual" ? 12 : 1);
    }
  }
  return credits;
}

/**
 * Paddle-Signature: "ts=1671552777;h1=<hex>" — HMAC-SHA256 of `${ts}:${rawBody}` with the
 * endpoint's secret. Rejects anything older than five minutes, so a captured request can't be
 * replayed later.
 */
export async function verifySignature(
  header: string | null,
  rawBody: string,
  secret: string,
  now: number,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(";").map((p) => p.split("=", 2) as [string, string]),
  );
  const ts = parts["ts"];
  const signatures = header
    .split(";")
    .filter((p) => p.startsWith("h1="))
    .map((p) => p.slice(3));
  if (!ts || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class PaddleApi {
  // Plain fields rather than constructor parameter properties, so the tests can run this file
  // with Node's built-in TypeScript stripping.
  private readonly apiKey: string;
  private readonly sandbox: boolean;

  constructor(apiKey: string, sandbox: boolean) {
    this.apiKey = apiKey;
    this.sandbox = sandbox;
  }

  private get base() {
    return this.sandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as { data?: T; error?: { detail?: string } } | null;
    if (!res.ok || !payload?.data) throw new Error(payload?.error?.detail ?? `Paddle ${res.status}`);
    return payload.data;
  }

  getSubscription(id: string) {
    return this.call<PaddleSubscription>("GET", `/subscriptions/${id}`);
  }

  /** Cancels at the end of the paid period — the trainee keeps what they've paid for. */
  cancelAtPeriodEnd(id: string) {
    return this.call<PaddleSubscription>("POST", `/subscriptions/${id}/cancel`, { effective_from: "next_billing_period" });
  }

  /** Removes a scheduled cancellation. */
  resume(id: string) {
    return this.call<PaddleSubscription>("PATCH", `/subscriptions/${id}`, { scheduled_change: null });
  }

  /** The exit offer: a recurring-for-3-cycles discount, from the next bill. */
  applyDiscount(id: string, discountId: string) {
    return this.call<PaddleSubscription>("PATCH", `/subscriptions/${id}`, {
      discount: { id: discountId, effective_from: "next_billing_period" },
    });
  }

  /** A transaction the website opens in Paddle Checkout to collect a new card for a past-due plan. */
  updatePaymentTransaction(id: string) {
    return this.call<{ id: string }>("GET", `/subscriptions/${id}/update-payment-method-transaction`);
  }
}
