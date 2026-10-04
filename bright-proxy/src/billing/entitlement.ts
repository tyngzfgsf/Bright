/**
 * Pure account logic — no I/O, so it's unit-tested directly (test/entitlement.test.ts) and the
 * Durable Object stays a thin persistence wrapper around it.
 */

import {
  type AccountState,
  type ClientEntitlement,
  type Credits,
  type Source,
  type Subscription,
  DRILL_TTL_MS,
  FREE_DRILLS_PER_MONTH,
  MAX_TURNS_PER_DRILL,
  PAID_FAIR_USE_DRILLS_PER_MONTH,
} from "./types.ts";

const PAID_STATUSES = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);
const PLAN_RANK = { PLUS: 1, PRO: 2 } as const;
const MAX_APPLIED_EVENTS = 300;

/** "2026-10" — the UTC month the free allowance resets on. */
export function usageMonth(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/**
 * Past-due counts as paid on purpose: during the stores' grace periods and Paddle's retries the
 * trainee keeps their plan, because cutting someone off the moment a card bounces punishes the
 * most fixable failure there is.
 */
export function isPaid(sub: Subscription | undefined, now: number): boolean {
  if (!sub || !PAID_STATUSES.has(sub.status)) return false;
  // A store record that stopped getting webhooks shouldn't grant access forever.
  return sub.currentPeriodEnd === 0 || sub.currentPeriodEnd > now - 24 * 60 * 60 * 1000;
}

/**
 * The subscription that decides the plan when someone (unusually) pays in two places: the
 * highest plan wins, then the one that runs longest.
 */
export function activeSubscription(
  state: AccountState,
  now: number,
): { source: Source; sub: Subscription } | null {
  let best: { source: Source; sub: Subscription } | null = null;
  for (const [source, sub] of Object.entries(state.subs) as [Source, Subscription][]) {
    if (!isPaid(sub, now)) continue;
    if (
      !best ||
      PLAN_RANK[sub.plan] > PLAN_RANK[best.sub.plan] ||
      (PLAN_RANK[sub.plan] === PLAN_RANK[best.sub.plan] && sub.currentPeriodEnd > best.sub.currentPeriodEnd)
    ) {
      best = { source, sub };
    }
  }
  return best;
}

function drillsUsed(state: AccountState, now: number): number {
  return state.usage.month === usageMonth(now) ? state.usage.used : 0;
}

export function toClientEntitlement(state: AccountState, now: number): ClientEntitlement {
  const active = activeSubscription(state, now);
  return {
    plan: active ? active.sub.plan : "FREE",
    period: active?.sub.period ?? null,
    status: active ? active.sub.status : anyCanceled(state) ? "CANCELED" : "NONE",
    trialEndsAtMillis: active?.sub.trialEndsAt ?? 0,
    currentPeriodEndMillis: active?.sub.currentPeriodEnd ?? 0,
    cancelAtPeriodEnd: active?.sub.cancelAtPeriodEnd ?? false,
    drillsUsed: drillsUsed(state, now),
    // Paid plans report unlimited: the fair-use ceiling is an abuse guard, not an advertised limit.
    drillsLimit: active ? null : FREE_DRILLS_PER_MONTH,
    bonusDrills: state.bonusDrills,
    streakFreezesGranted: state.streakFreezesGranted,
    trialEligible: !state.trialUsed,
    retentionOfferEligible: !state.retentionOfferUsed,
    discountActive: active?.sub.discountActive ?? false,
    source: active?.source ?? null,
    managementUrl: active?.sub.managementUrl ?? null,
  };
}

function anyCanceled(state: AccountState): boolean {
  return Object.values(state.subs).some((s) => s?.status === "CANCELED");
}

export type TurnDecision =
  | { allowed: true; newDrill: boolean; usedBonus: boolean }
  | { allowed: false; code: "drill_limit"; reason: "free_limit" | "fair_use_limit"; limit: number }
  | { allowed: false; code: "drill_expired" | "drill_turn_limit" };

/**
 * Meters one hosted model call. The first call carrying a drill id the account hasn't seen this
 * month spends a drill — this month's allowance first, then purchased bonus drills (which never
 * expire, so they're the thing to save). Later calls with the same id just count turns.
 *
 * Mutates and returns `state`; the caller persists it only when the call is allowed.
 */
export function consumeTurn(state: AccountState, drillId: string, now: number): TurnDecision {
  const month = usageMonth(now);
  if (state.usage.month !== month) state.usage = { month, used: 0, drills: {} };

  const existing = state.usage.drills[drillId];
  if (existing) {
    if (now - existing.firstTurnAt > DRILL_TTL_MS) return { allowed: false, code: "drill_expired" };
    if (existing.turns >= MAX_TURNS_PER_DRILL) return { allowed: false, code: "drill_turn_limit" };
    existing.turns += 1;
    return { allowed: true, newDrill: false, usedBonus: false };
  }

  const paid = activeSubscription(state, now) !== null;
  const allowance = paid ? PAID_FAIR_USE_DRILLS_PER_MONTH : FREE_DRILLS_PER_MONTH;
  let usedBonus = false;
  if (state.usage.used < allowance) {
    state.usage.used += 1;
  } else if (state.bonusDrills > 0) {
    state.bonusDrills -= 1;
    usedBonus = true;
  } else {
    return { allowed: false, code: "drill_limit", reason: paid ? "fair_use_limit" : "free_limit", limit: allowance };
  }
  state.usage.drills[drillId] = { firstTurnAt: now, turns: 1 };
  pruneDrills(state, now);
  return { allowed: true, newDrill: true, usedBonus };
}

/** Undo a call that never reached the trainee (the model failed). A first turn refunds the drill. */
export function refundTurn(state: AccountState, drillId: string, decision: TurnDecision): void {
  if (!decision.allowed) return;
  const record = state.usage.drills[drillId];
  if (!record) return;
  if (decision.newDrill) {
    delete state.usage.drills[drillId];
    if (decision.usedBonus) state.bonusDrills += 1;
    else state.usage.used = Math.max(0, state.usage.used - 1);
  } else {
    record.turns = Math.max(0, record.turns - 1);
  }
}

/** Keeps the per-drill map small: expired drills can't take turns anyway. */
function pruneDrills(state: AccountState, now: number): void {
  for (const [id, record] of Object.entries(state.usage.drills)) {
    if (now - record.firstTurnAt > DRILL_TTL_MS) delete state.usage.drills[id];
  }
}

/** Applies webhook credits once per event id. Returns false if this event was already applied. */
export function applyCredits(state: AccountState, eventId: string, credits: Credits): boolean {
  if (state.appliedEvents.includes(eventId)) return false;
  state.appliedEvents.push(eventId);
  if (state.appliedEvents.length > MAX_APPLIED_EVENTS) state.appliedEvents.splice(0, state.appliedEvents.length - MAX_APPLIED_EVENTS);
  state.bonusDrills += credits.bonusDrills;
  state.streakFreezesGranted += credits.streakFreezes;
  return true;
}

/** Marks an event seen without crediting anything (emails, etc.). */
export function markEvent(state: AccountState, eventId: string): boolean {
  return applyCredits(state, eventId, { bonusDrills: 0, streakFreezes: 0 });
}
