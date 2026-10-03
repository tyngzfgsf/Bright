/**
 * Drill metering against the Firestore emulator — no real project, no Stripe.
 *
 *   npm test        (wraps: firebase emulators:exec --only firestore --project demo-bright ...)
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Run via `npm test` so these hit the emulator, never a real database.");
}

initializeApp({ projectId: "demo-bright" });
const { startDrill, consumeDrillTurn, grantCredits, toClientEntitlement, usageWindow, MAX_TURNS_PER_DRILL } =
  await import("../billing/entitlements.js");
const { FREE_DRILLS_PER_MONTH } = await import("../billing/catalog.js");

const db = getFirestore();
const uid = () => `u_${Math.random().toString(36).slice(2)}`;

before(async () => {
  await db.recursiveDelete(db.collection("users"));
  await db.recursiveDelete(db.collection("drills"));
});

test("free plan stops at the monthly cap with a resource-exhausted error", async () => {
  const u = uid();
  for (let i = 0; i < FREE_DRILLS_PER_MONTH; i++) await startDrill(u);
  await assert.rejects(startDrill(u), (err) => err.code === "resource-exhausted" && err.details.reason === "free_limit");
  const ent = toClientEntitlement((await db.doc(`users/${u}`).get()).data());
  assert.equal(ent.drillsUsed, FREE_DRILLS_PER_MONTH);
  assert.equal(ent.drillsLimit, FREE_DRILLS_PER_MONTH);
});

test("concurrent starts can't overspend the last free drill", async () => {
  const u = uid();
  for (let i = 0; i < FREE_DRILLS_PER_MONTH - 1; i++) await startDrill(u);
  const results = await Promise.allSettled([startDrill(u), startDrill(u), startDrill(u)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("bonus drills are spent only after the allowance, and are idempotent per event", async () => {
  const u = uid();
  await grantCredits(u, { bonusDrills: 2 }, "evt_1");
  await grantCredits(u, { bonusDrills: 2 }, "evt_1"); // webhook retry
  for (let i = 0; i < FREE_DRILLS_PER_MONTH; i++) await startDrill(u);
  assert.equal((await db.doc(`users/${u}`).get()).get("bonusDrills"), 2);
  await startDrill(u);
  await startDrill(u);
  await assert.rejects(startDrill(u), (err) => err.code === "resource-exhausted");
});

test("a new month resets the allowance", async () => {
  const u = uid();
  await db.doc(`users/${u}`).set({ usageWindow: "2000-01", drillsUsed: FREE_DRILLS_PER_MONTH });
  const { entitlement } = await startDrill(u);
  assert.equal(entitlement.drillsUsed, 1);
  assert.equal((await db.doc(`users/${u}`).get()).get("usageWindow"), usageWindow());
});

test("paid plans report unlimited and aren't stopped at the free cap", async () => {
  const u = uid();
  await db.doc(`users/${u}`).set({ plan: "PLUS", status: "ACTIVE" });
  for (let i = 0; i < FREE_DRILLS_PER_MONTH + 3; i++) await startDrill(u);
  const ent = toClientEntitlement((await db.doc(`users/${u}`).get()).data());
  assert.equal(ent.drillsLimit, null);
});

test("past-due keeps paid access; canceled falls back to the free cap", async () => {
  const pastDue = uid();
  await db.doc(`users/${pastDue}`).set({ plan: "PLUS", status: "PAST_DUE", usageWindow: usageWindow(), drillsUsed: 50 });
  await startDrill(pastDue);
  const canceled = uid();
  await db.doc(`users/${canceled}`).set({ plan: "FREE", status: "CANCELED", usageWindow: usageWindow(), drillsUsed: 50 });
  await assert.rejects(startDrill(canceled), (err) => err.code === "resource-exhausted");
});

test("a drill ticket only works for its owner, and only up to the turn ceiling", async () => {
  const owner = uid();
  const { drillId } = await startDrill(owner);
  assert.equal(await consumeDrillTurn(uid(), drillId), "drill_required");
  assert.equal(await consumeDrillTurn(owner, "nope"), "drill_required");
  assert.equal(await consumeDrillTurn(owner, "../users/x"), "drill_required");
  for (let i = 0; i < MAX_TURNS_PER_DRILL; i++) assert.equal(await consumeDrillTurn(owner, drillId), null);
  assert.equal(await consumeDrillTurn(owner, drillId), "drill_turn_limit");
});

test("an expired drill ticket is refused", async () => {
  const owner = uid();
  const ref = db.collection("drills").doc();
  await ref.set({ uid: owner, createdAt: Date.now() - 13 * 60 * 60 * 1000, turns: 0 });
  assert.equal(await consumeDrillTurn(owner, ref.id), "drill_expired");
});
