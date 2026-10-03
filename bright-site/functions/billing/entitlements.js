/**
 * The per-user billing record (`users/{uid}`) and hosted-drill metering — BACKEND_PLAN.md Phase 3.
 *
 * Only Cloud Functions write this document; firestore.rules lets the owner read it and nobody
 * write it. If a client could write it, a modified APK could simply set `plan: "pro"`.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { FREE_DRILLS_PER_MONTH, PAID_FAIR_USE_DRILLS_PER_MONTH } from "./catalog.js";

/** A drill can make this many model calls (scenario turns, asides, the end-of-case debrief). */
export const MAX_TURNS_PER_DRILL = 80;

/** A drill id stops working this long after it was issued. */
export const DRILL_TTL_MS = 12 * 60 * 60 * 1000;

const PAID_STATUSES = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

export function db() {
  return getFirestore();
}

export function userRef(uid) {
  return db().doc(`users/${uid}`);
}

/** "2026-10" — the UTC calendar month the free allowance resets on. */
export function usageWindow(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function hasPaidAccess(data) {
  return !!data && data.plan && data.plan !== "FREE" && PAID_STATUSES.has(data.status);
}

/** Monthly allowance for this record, before bonus drills. */
function drillAllowance(data) {
  return hasPaidAccess(data) ? PAID_FAIR_USE_DRILLS_PER_MONTH : FREE_DRILLS_PER_MONTH;
}

function drillsUsedThisWindow(data, window) {
  return data?.usageWindow === window ? data.drillsUsed || 0 : 0;
}

/**
 * The shape the app's `Entitlement` data class decodes (field names and enum spellings must
 * match it). Paid plans report `drillsLimit: null` — the fair-use ceiling is an abuse guard,
 * not something to advertise as a limit.
 */
export function toClientEntitlement(data) {
  const d = data || {};
  const paid = hasPaidAccess(d);
  return {
    plan: d.plan || "FREE",
    period: d.period || null,
    status: d.status || "NONE",
    trialEndsAtMillis: d.trialEndsAt || 0,
    currentPeriodEndMillis: d.currentPeriodEnd || 0,
    cancelAtPeriodEnd: !!d.cancelAtPeriodEnd,
    drillsUsed: drillsUsedThisWindow(d, usageWindow()),
    drillsLimit: paid ? null : FREE_DRILLS_PER_MONTH,
    bonusDrills: d.bonusDrills || 0,
    streakFreezesGranted: d.streakFreezesGranted || 0,
    trialEligible: !d.trialUsed,
    retentionOfferEligible: !d.retentionOfferUsed,
    discountActive: !!d.discountActive,
  };
}

/**
 * Spends one hosted drill and issues a drill id the proxy will accept. Atomic, so two devices
 * starting at once can't both take the last free drill.
 *
 * Order of spending: this month's allowance first, then purchased bonus drills (which never
 * expire, so they're the thing to save).
 */
export async function startDrill(uid) {
  const window = usageWindow();
  return db().runTransaction(async (tx) => {
    const ref = userRef(uid);
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const used = drillsUsedThisWindow(data, window);
    const allowance = drillAllowance(data);
    const bonus = data.bonusDrills || 0;

    const update = { usageWindow: window };
    if (used < allowance) {
      update.drillsUsed = used + 1;
    } else if (bonus > 0) {
      update.drillsUsed = used;
      update.bonusDrills = bonus - 1;
    } else {
      // `details.reason` is what the app keys the paywall off — the message is for logs.
      throw new HttpsError("resource-exhausted", "Monthly drill limit reached.", {
        reason: hasPaidAccess(data) ? "fair_use_limit" : "free_limit",
        limit: allowance,
      });
    }

    tx.set(ref, update, { merge: true });

    const drillRef = db().collection("drills").doc();
    tx.set(drillRef, { uid, createdAt: Date.now(), turns: 0 });

    const after = { ...data, ...update };
    return { drillId: drillRef.id, entitlement: toClientEntitlement(after) };
  });
}

/**
 * Called by the proxy before every model call. Returns null if the call may go ahead, or an
 * error code string otherwise. Counts the turn in the same transaction that checks it.
 */
export async function consumeDrillTurn(uid, drillId) {
  if (typeof drillId !== "string" || drillId.length === 0 || drillId.length > 128 || drillId.includes("/")) {
    return "drill_required";
  }
  return db().runTransaction(async (tx) => {
    const ref = db().doc(`drills/${drillId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) return "drill_required";
    const drill = snap.data();
    if (drill.uid !== uid) return "drill_required";
    if (Date.now() - drill.createdAt > DRILL_TTL_MS) return "drill_expired";
    if ((drill.turns || 0) >= MAX_TURNS_PER_DRILL) return "drill_turn_limit";
    tx.update(ref, { turns: FieldValue.increment(1) });
    return null;
  });
}

/** Adds purchased/perk credits. `eventId` makes it idempotent across webhook retries. */
export async function grantCredits(uid, { bonusDrills = 0, streakFreezes = 0 }, eventId) {
  if (!bonusDrills && !streakFreezes) return;
  await db().runTransaction(async (tx) => {
    const marker = db().doc(`users/${uid}/grants/${eventId}`);
    if ((await tx.get(marker)).exists) return;
    tx.set(marker, { bonusDrills, streakFreezes, at: Date.now() });
    tx.set(
      userRef(uid),
      {
        bonusDrills: FieldValue.increment(bonusDrills),
        streakFreezesGranted: FieldValue.increment(streakFreezes),
      },
      { merge: true }
    );
  });
}
