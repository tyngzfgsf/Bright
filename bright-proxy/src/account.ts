/**
 * One Durable Object per Firebase uid: the trainee's plan (from every payment system), monthly
 * drill usage and purchased credits. Durable Objects run one request at a time per instance, so
 * every read-modify-write below is atomic without explicit locking — two devices racing for the
 * last free drill can't both get it.
 *
 * A second use of the same class, named "paddle:<customer id>", only stores which uid that
 * Paddle customer belongs to, for webhooks that arrive without our custom data.
 */

import { DurableObject } from "cloudflare:workers";
import {
  activeSubscription,
  applyCredits,
  consumeTurn,
  markEvent,
  refundTurn,
  toClientEntitlement,
  type TurnDecision,
} from "./billing/entitlement.ts";
import { manageHint, render, sendEmail, type EmailKind } from "./billing/email.ts";
import {
  type AccountState,
  type ClientEntitlement,
  type Credits,
  emptyAccount,
  type Source,
  type Subscription,
  TRIAL_REMINDER_LEAD_MS,
} from "./billing/types.ts";
import type { Env } from "./index.ts";

const STATE_KEY = "account";

export class Account extends DurableObject<Env> {
  private async load(): Promise<AccountState> {
    return { ...emptyAccount(), ...((await this.ctx.storage.get<AccountState>(STATE_KEY)) ?? {}) };
  }

  private async save(state: AccountState): Promise<void> {
    await this.ctx.storage.put(STATE_KEY, state);
  }

  async state(): Promise<AccountState> {
    return this.load();
  }

  async entitlement(): Promise<ClientEntitlement> {
    return toClientEntitlement(await this.load(), Date.now());
  }

  /** Remembers where to email and in which language. Called on authenticated requests. */
  async touchProfile(email: string | null, locale: "en" | "ko" | null): Promise<void> {
    const state = await this.load();
    let changed = false;
    if (email && state.email !== email) {
      state.email = email;
      changed = true;
    }
    if (locale && state.locale !== locale) {
      state.locale = locale;
      changed = true;
    }
    if (changed) await this.save(state);
  }

  async consume(drillId: string): Promise<{ decision: TurnDecision; entitlement: ClientEntitlement }> {
    const now = Date.now();
    const state = await this.load();
    const decision = consumeTurn(state, drillId, now);
    if (decision.allowed) await this.save(state);
    return { decision, entitlement: toClientEntitlement(state, now) };
  }

  async refund(drillId: string, decision: TurnDecision): Promise<void> {
    const state = await this.load();
    refundTurn(state, drillId, decision);
    await this.save(state);
  }

  /** Replaces the records for the given sources (null clears one). */
  async setSubscriptions(
    subs: Partial<Record<Source, Subscription | null>>,
    extra: { paddleCustomerId?: string; paddleSubscriptionId?: string } = {},
  ): Promise<ClientEntitlement> {
    const now = Date.now();
    const state = await this.load();
    for (const [source, sub] of Object.entries(subs) as [Source, Subscription | null][]) {
      if (sub) state.subs[source] = sub;
      else delete state.subs[source];
      if (sub?.status === "TRIALING" || (sub?.trialEndsAt ?? 0) > 0) state.trialUsed = true;
    }
    if (extra.paddleCustomerId) state.paddleCustomerId = extra.paddleCustomerId;
    if (extra.paddleSubscriptionId) state.paddleSubscriptionId = extra.paddleSubscriptionId;
    await this.save(state);
    await this.scheduleTrialReminder(state, now);
    return toClientEntitlement(state, now);
  }

  async credit(eventId: string, credits: Credits): Promise<void> {
    const state = await this.load();
    if (applyCredits(state, eventId, credits)) await this.save(state);
  }

  async markRetentionOfferUsed(): Promise<void> {
    const state = await this.load();
    state.retentionOfferUsed = true;
    await this.save(state);
  }

  /** Sends a billing email once per `dedupeKey`. */
  async notify(kind: EmailKind, dedupeKey: string, date?: number): Promise<void> {
    const state = await this.load();
    if (!state.email) return;
    if (!markEvent(state, `email:${kind}:${dedupeKey}`)) return;
    await this.save(state);
    const source = activeSubscription(state, Date.now())?.source ?? null;
    await sendEmail(
      this.env.RESEND_API_KEY,
      this.env.EMAIL_FROM,
      state.email,
      render(kind, state.locale, { date, manageHint: manageHint(source, state.locale) }),
    );
  }

  /**
   * Trial reminders: an alarm 3 days before the earliest trial end. Stores and Paddle don't
   * reliably warn people before a trial converts, and a surprise first charge is the classic
   * source of refund requests and chargebacks.
   */
  private async scheduleTrialReminder(state: AccountState, now: number): Promise<void> {
    const trials = Object.values(state.subs).filter(
      (s): s is Subscription => !!s && s.status === "TRIALING" && !s.cancelAtPeriodEnd && s.trialEndsAt > now,
    );
    if (trials.length === 0) return;
    const remindAt = Math.min(...trials.map((s) => s.trialEndsAt)) - TRIAL_REMINDER_LEAD_MS;
    await this.ctx.storage.setAlarm(Math.max(remindAt, now + 1000));
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const state = await this.load();
    for (const [source, sub] of Object.entries(state.subs) as [Source, Subscription][]) {
      const due = sub.trialEndsAt - TRIAL_REMINDER_LEAD_MS;
      if (sub.status === "TRIALING" && !sub.cancelAtPeriodEnd && due <= now + 60_000 && sub.trialEndsAt > now) {
        await this.notify("trial_ending", `${source}:${sub.trialEndsAt}`, sub.trialEndsAt);
      }
    }
    await this.scheduleTrialReminder(await this.load(), now + TRIAL_REMINDER_LEAD_MS);
  }

  // --- "paddle:<customer>" instances ---------------------------------------------------------

  async link(uid: string): Promise<void> {
    await this.ctx.storage.put("uid", uid);
  }

  async linkedUid(): Promise<string | null> {
    return (await this.ctx.storage.get<string>("uid")) ?? null;
  }
}
