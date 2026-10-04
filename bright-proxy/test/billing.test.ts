/** Pure billing logic — run with `npm test` (Node runs the TypeScript directly). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCredits, consumeTurn, refundTurn, toClientEntitlement, activeSubscription } from "../src/billing/entitlement.ts";
import { creditsForEvent, mapSubscriber, type RcSubscriber } from "../src/billing/revenuecat.ts";
import { creditsForTransaction, mapSubscription, verifySignature, type PaddleSubscription } from "../src/billing/paddle.ts";
import { emptyAccount, FREE_DRILLS_PER_MONTH, MAX_TURNS_PER_DRILL, DRILL_TTL_MS, type Subscription } from "../src/billing/types.ts";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const DAY = 86_400_000;

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    plan: "PLUS", period: "MONTHLY", status: "ACTIVE", trialEndsAt: 0, currentPeriodEnd: NOW + 20 * DAY,
    cancelAtPeriodEnd: false, discountActive: false, reference: null, managementUrl: null, updatedAt: NOW, ...overrides,
  };
}

test("free plan: 10 new drills a month, then drill_limit", () => {
  const s = emptyAccount();
  for (let i = 0; i < FREE_DRILLS_PER_MONTH; i++) assert.equal(consumeTurn(s, `d${i}`, NOW).allowed, true);
  const refused = consumeTurn(s, "d-extra", NOW);
  assert.deepEqual(refused, { allowed: false, code: "drill_limit", reason: "free_limit", limit: FREE_DRILLS_PER_MONTH });
});

test("turns within one drill don't spend more drills", () => {
  const s = emptyAccount();
  for (let i = 0; i < 20; i++) consumeTurn(s, "same", NOW);
  assert.equal(toClientEntitlement(s, NOW).drillsUsed, 1);
});

test("a drill has a turn ceiling and an expiry", () => {
  const s = emptyAccount();
  for (let i = 0; i < MAX_TURNS_PER_DRILL; i++) assert.equal(consumeTurn(s, "d", NOW).allowed, true);
  assert.deepEqual(consumeTurn(s, "d", NOW), { allowed: false, code: "drill_turn_limit" });
  consumeTurn(s, "old", NOW);
  assert.deepEqual(consumeTurn(s, "old", NOW + DRILL_TTL_MS + 1), { allowed: false, code: "drill_expired" });
});

test("bonus drills are spent only after the allowance, and refunds put them back", () => {
  const s = emptyAccount();
  s.bonusDrills = 1;
  for (let i = 0; i < FREE_DRILLS_PER_MONTH; i++) consumeTurn(s, `d${i}`, NOW);
  assert.equal(s.bonusDrills, 1);
  const d = consumeTurn(s, "bonus", NOW);
  assert.equal(s.bonusDrills, 0);
  refundTurn(s, "bonus", d);
  assert.equal(s.bonusDrills, 1);
});

test("refunding a first turn refunds the drill; a later turn only the turn", () => {
  const s = emptyAccount();
  const first = consumeTurn(s, "d", NOW);
  refundTurn(s, "d", first);
  assert.equal(s.usage.used, 0);
  consumeTurn(s, "d", NOW);
  const second = consumeTurn(s, "d", NOW);
  refundTurn(s, "d", second);
  assert.equal(s.usage.used, 1);
  assert.equal(s.usage.drills["d"].turns, 1);
});

test("a new month resets the allowance", () => {
  const s = emptyAccount();
  for (let i = 0; i < FREE_DRILLS_PER_MONTH; i++) consumeTurn(s, `d${i}`, NOW);
  assert.equal(consumeTurn(s, "next-month", NOW + 20 * DAY).allowed, true);
});

test("paid plans aren't stopped at the free cap and report unlimited", () => {
  const s = emptyAccount();
  s.subs.web = sub();
  for (let i = 0; i < FREE_DRILLS_PER_MONTH + 5; i++) assert.equal(consumeTurn(s, `d${i}`, NOW).allowed, true);
  assert.equal(toClientEntitlement(s, NOW).drillsLimit, null);
});

test("past-due keeps access; canceled falls back to free", () => {
  const s = emptyAccount();
  s.subs.play_store = sub({ status: "PAST_DUE" });
  assert.equal(toClientEntitlement(s, NOW).plan, "PLUS");
  s.subs.play_store = sub({ status: "CANCELED" });
  const e = toClientEntitlement(s, NOW);
  assert.equal(e.plan, "FREE");
  assert.equal(e.status, "CANCELED");
});

test("paying in two places: the higher plan wins and names its source", () => {
  const s = emptyAccount();
  s.subs.web = sub({ plan: "PLUS" });
  s.subs.app_store = sub({ plan: "PRO", managementUrl: "https://apps.apple.com/account/subscriptions" });
  const e = toClientEntitlement(s, NOW);
  assert.equal(e.plan, "PRO");
  assert.equal(e.source, "app_store");
  assert.equal(e.managementUrl, "https://apps.apple.com/account/subscriptions");
});

test("a store record that stopped updating stops granting access", () => {
  const s = emptyAccount();
  s.subs.play_store = sub({ currentPeriodEnd: NOW - 3 * DAY });
  assert.equal(activeSubscription(s, NOW), null);
});

test("credits apply once per event id", () => {
  const s = emptyAccount();
  assert.equal(applyCredits(s, "e1", { bonusDrills: 20, streakFreezes: 0 }), true);
  assert.equal(applyCredits(s, "e1", { bonusDrills: 20, streakFreezes: 0 }), false);
  assert.equal(s.bonusDrills, 20);
});

// --- RevenueCat ---

const iso = (t: number) => new Date(t).toISOString();

test("RevenueCat: Play trial maps to TRIALING Plus with the trial end", () => {
  const subscriber: RcSubscriber = {
    entitlements: { plus: { expires_date: iso(NOW + 5 * DAY), product_identifier: "bright_plus:monthly" } },
    subscriptions: {
      bright_plus: {
        expires_date: iso(NOW + 5 * DAY), period_type: "trial", store: "play_store",
        unsubscribe_detected_at: null, billing_issues_detected_at: null, product_plan_identifier: "monthly",
      },
    },
    management_url: "https://play.google.com/store/account/subscriptions",
  };
  const mapped = mapSubscriber(subscriber, NOW, {});
  assert.equal(mapped.play_store?.status, "TRIALING");
  assert.equal(mapped.play_store?.trialEndsAt, NOW + 5 * DAY);
  assert.equal(mapped.play_store?.period, "MONTHLY");
  assert.equal(mapped.app_store, null);
});

test("RevenueCat: Pro wins over Plus; billing issue in grace is PAST_DUE", () => {
  const subscriber: RcSubscriber = {
    entitlements: {
      plus: { expires_date: iso(NOW + DAY), product_identifier: "bright_pro_annual" },
      pro: { expires_date: iso(NOW - DAY), grace_period_expires_date: iso(NOW + 6 * DAY), product_identifier: "bright_pro_annual" },
    },
    subscriptions: {
      bright_pro_annual: {
        expires_date: iso(NOW - DAY), grace_period_expires_date: iso(NOW + 6 * DAY), period_type: "normal",
        store: "app_store", unsubscribe_detected_at: null, billing_issues_detected_at: iso(NOW - DAY),
      },
    },
  };
  const mapped = mapSubscriber(subscriber, NOW, {});
  assert.equal(mapped.app_store?.plan, "PRO");
  assert.equal(mapped.app_store?.status, "PAST_DUE");
  assert.equal(mapped.app_store?.period, "ANNUAL");
});

test("RevenueCat: a lapsed store subscription reads as CANCELED, not gone", () => {
  const mapped = mapSubscriber({ entitlements: {}, subscriptions: {} }, NOW, { play_store: sub() });
  assert.equal(mapped.play_store?.status, "CANCELED");
});

test("RevenueCat: add-on and Pro freeze credits", () => {
  assert.deepEqual(creditsForEvent({ id: "1", type: "NON_RENEWING_PURCHASE", app_user_id: "u", product_id: "addon_drill_pack" }), { bonusDrills: 20, streakFreezes: 0 });
  assert.deepEqual(creditsForEvent({ id: "2", type: "RENEWAL", app_user_id: "u", product_id: "bright_pro_monthly", period_type: "NORMAL" }), { bonusDrills: 0, streakFreezes: 3 });
  assert.equal(creditsForEvent({ id: "3", type: "INITIAL_PURCHASE", app_user_id: "u", product_id: "bright_plus_monthly", period_type: "TRIAL" }), null);
});

// --- Paddle ---

const prices = { pri_plus_m: "plus_monthly", pri_pro_y: "pro_annual", pri_pack: "addon_drill_pack" };

test("Paddle: subscription mapping, scheduled cancel and discount", () => {
  const p: PaddleSubscription = {
    id: "sub_1", status: "active", customer_id: "ctm_1", custom_data: { uid: "u" },
    items: [{ price: { id: "pri_plus_m" } }],
    current_billing_period: { starts_at: iso(NOW - 10 * DAY), ends_at: iso(NOW + 20 * DAY) },
    scheduled_change: { action: "cancel", effective_at: iso(NOW + 20 * DAY) },
    discount: { id: "dsc_1", ends_at: null },
  };
  const m = mapSubscription(p, prices, NOW)!;
  assert.equal(m.plan, "PLUS");
  assert.equal(m.cancelAtPeriodEnd, true);
  assert.equal(m.discountActive, true);
  assert.equal(m.currentPeriodEnd, NOW + 20 * DAY);
  assert.equal(mapSubscription({ ...p, items: [{ price: { id: "pri_unknown" } }] }, prices, NOW), null);
});

test("Paddle: transaction credits add-ons and paid Pro charges only", () => {
  assert.deepEqual(
    creditsForTransaction({ id: "t", items: [{ price: { id: "pri_pack" }, quantity: 2 }], details: { totals: { total: "5000" } } }, prices),
    { bonusDrills: 40, streakFreezes: 0 },
  );
  assert.deepEqual(
    creditsForTransaction({ id: "t", items: [{ price: { id: "pri_pro_y" }, quantity: 1 }], details: { totals: { total: "99000" } } }, prices),
    { bonusDrills: 0, streakFreezes: 36 },
  );
  assert.deepEqual(
    creditsForTransaction({ id: "t", items: [{ price: { id: "pri_pro_y" }, quantity: 1 }], details: { totals: { total: "0" } } }, prices),
    { bonusDrills: 0, streakFreezes: 0 },
  );
});

async function sign(secret: string, ts: number, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

test("Paddle: signature verification accepts valid, rejects tampered and stale", async () => {
  const ts = Math.floor(NOW / 1000);
  const body = '{"event_type":"transaction.completed"}';
  const h1 = await sign("whsec", ts, body);
  assert.equal(await verifySignature(`ts=${ts};h1=${h1}`, body, "whsec", NOW), true);
  assert.equal(await verifySignature(`ts=${ts};h1=${h1}`, body + " ", "whsec", NOW), false);
  assert.equal(await verifySignature(`ts=${ts};h1=${h1}`, body, "other", NOW), false);
  assert.equal(await verifySignature(`ts=${ts};h1=${h1}`, body, "whsec", NOW + 10 * 60_000), false);
  assert.equal(await verifySignature(null, body, "whsec", NOW), false);
});
