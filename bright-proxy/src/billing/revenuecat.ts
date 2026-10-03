/**
 * Google Play and App Store subscriptions, via RevenueCat.
 *
 * RevenueCat validates the store receipts; the apps log in to it with the Firebase uid, so its
 * `app_user_id` is our account key. Its webhook only says *that* something changed — the handler
 * re-reads the subscriber from RevenueCat's REST API and maps that, because webhook order isn't
 * guaranteed and a late event must never overwrite newer state.
 *
 * Entitlement identifiers configured in RevenueCat: "plus" and "pro" (Pro also unlocks
 * everything Plus does — the app checks plan rank, not entitlement ids). Add-ons are
 * consumable products with ids "addon_drill_pack" and "addon_streak_freezes" in both stores.
 */

import {
  ADD_ON_CREDITS,
  type AddOn,
  type Credits,
  type Period,
  PRO_MONTHLY_STREAK_FREEZES,
  type Subscription,
} from "./types.ts";

type RcEntitlement = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
};

type RcSubscription = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  period_type: "normal" | "trial" | "intro" | string;
  store: string;
  unsubscribe_detected_at: string | null;
  billing_issues_detected_at: string | null;
  product_plan_identifier?: string | null;
};

export type RcSubscriber = {
  entitlements: Record<string, RcEntitlement>;
  subscriptions: Record<string, RcSubscription>;
  management_url?: string | null;
};

export type RcEvent = {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string;
  period_type?: string;
  store?: string;
  expiration_at_ms?: number | null;
};

export type StoreSource = "play_store" | "app_store";

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

function periodOf(productId: string, planId?: string | null): Period | null {
  const text = `${productId} ${planId ?? ""}`.toLowerCase();
  if (/annual|year|p1y/.test(text)) return "ANNUAL";
  if (/month|p1m/.test(text)) return "MONTHLY";
  return null;
}

/** RevenueCat keys Play subscriptions by "product:basePlan" in some payloads and by product in others. */
function subscriptionFor(subscriber: RcSubscriber, productId: string): RcSubscription | undefined {
  return subscriber.subscriptions[productId] ?? subscriber.subscriptions[productId.split(":")[0]];
}

/**
 * The current state of each store's subscription for this subscriber, or null when that store
 * has nothing active. `previous` lets a lapsed subscription read as CANCELED rather than vanish.
 */
export function mapSubscriber(
  subscriber: RcSubscriber,
  now: number,
  previous: Partial<Record<StoreSource, Subscription>>,
): Record<StoreSource, Subscription | null> {
  const result: Record<StoreSource, Subscription | null> = { play_store: null, app_store: null };

  for (const store of ["play_store", "app_store"] as const) {
    for (const plan of ["PRO", "PLUS"] as const) {
      const ent = subscriber.entitlements[plan.toLowerCase()];
      if (!ent) continue;
      const sub = subscriptionFor(subscriber, ent.product_identifier);
      if (!sub || sub.store !== store) continue;

      const expires = ms(ent.expires_date ?? sub.expires_date);
      const grace = ms(ent.grace_period_expires_date ?? sub.grace_period_expires_date);
      const activeUntil = Math.max(expires, grace);
      const active = ent.expires_date === null || activeUntil > now;
      if (!active) continue;

      const billingIssue = sub.billing_issues_detected_at !== null || grace > expires;
      result[store] = {
        plan,
        period: periodOf(ent.product_identifier, sub.product_plan_identifier),
        status: billingIssue ? "PAST_DUE" : sub.period_type === "trial" ? "TRIALING" : "ACTIVE",
        trialEndsAt: sub.period_type === "trial" ? expires : 0,
        currentPeriodEnd: expires,
        cancelAtPeriodEnd: sub.unsubscribe_detected_at !== null,
        // Store-side discounts (Apple promotional / Play retention offers) are priced into the
        // product, not flagged — the app shows the exit offer only once anyway.
        discountActive: false,
        reference: ent.product_identifier,
        managementUrl: subscriber.management_url ?? null,
        updatedAt: now,
      };
      break;
    }

    if (!result[store] && previous[store] && previous[store]!.status !== "CANCELED") {
      result[store] = { ...previous[store]!, status: "CANCELED", cancelAtPeriodEnd: false, updatedAt: now };
    }
  }
  return result;
}

/** Credits a webhook event carries: add-on purchases, and Pro's monthly streak freezes. */
export function creditsForEvent(event: RcEvent): Credits | null {
  const product = event.product_id ?? "";
  if (event.type === "NON_RENEWING_PURCHASE") {
    const key = (Object.keys(ADD_ON_CREDITS) as AddOn[]).find((k) => product === k || product.startsWith(`${k}:`));
    return key ? ADD_ON_CREDITS[key] : null;
  }
  const paidPeriod = event.period_type === "NORMAL" || event.period_type === "normal";
  if ((event.type === "INITIAL_PURCHASE" || event.type === "RENEWAL") && paidPeriod && /pro/i.test(product)) {
    const months = periodOf(product) === "ANNUAL" ? 12 : 1;
    return { bonusDrills: 0, streakFreezes: PRO_MONTHLY_STREAK_FREEZES * months };
  }
  return null;
}

export async function fetchSubscriber(appUserId: string, secretKey: string): Promise<RcSubscriber> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  const body = (await res.json()) as { subscriber: RcSubscriber };
  return body.subscriber;
}

/** Anonymous RevenueCat ids appear before the app logs in; they have no account to update. */
export function isAnonymousId(appUserId: string): boolean {
  return appUserId.startsWith("$RCAnonymousID");
}
