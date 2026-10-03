"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/app/auth";

/**
 * The trainee's Bright account as bright-proxy reports it — the same record the Android app
 * reads, merged from Google Play, the App Store and website (Paddle) purchases.
 */
export type Entitlement = {
  plan: "FREE" | "PLUS" | "PRO";
  period: "MONTHLY" | "ANNUAL" | null;
  status: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
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
  source: "play_store" | "app_store" | "web" | null;
  managementUrl: string | null;
};

export const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:8787";

export function hasPaidAccess(e: Entitlement | null): boolean {
  return !!e && e.plan !== "FREE" && ["TRIALING", "ACTIVE", "PAST_DUE"].includes(e.status);
}

type State = { entitlement: Entitlement | null; loading: boolean; error: string | null };

export function useAccount(locale: "en" | "ko") {
  const { user, getIdToken } = useAuth();
  const [state, setState] = useState<State>({ entitlement: null, loading: false, error: null });

  const refresh = useCallback(async (): Promise<Entitlement | null> => {
    const token = await getIdToken();
    if (!token) {
      setState({ entitlement: null, loading: false, error: null });
      return null;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(`${PROXY_URL}/v1/account?locale=${locale}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entitlement = (await res.json()) as Entitlement;
      setState({ entitlement, loading: false, error: null });
      return entitlement;
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      return null;
    }
  }, [getIdToken, locale]);

  useEffect(() => {
    void refresh();
  }, [user?.uid, refresh]);

  /** POST /v1/web/<action> — managing a website subscription. */
  const webAction = useCallback(
    async (action: "cancel" | "resume" | "update-payment", body?: unknown): Promise<{ ok: boolean; data: unknown }> => {
      const token = await getIdToken();
      if (!token) return { ok: false, data: null };
      const res = await fetch(`${PROXY_URL}/v1/web/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && action !== "update-payment") setState({ entitlement: data as Entitlement, loading: false, error: null });
      return { ok: res.ok, data };
    },
    [getIdToken],
  );

  /**
   * After checkout, Paddle tells bright-proxy by webhook a moment later. Poll briefly so the page
   * can show the new plan instead of a stale "Free".
   */
  const awaitChange = useCallback(
    async (isDone: (e: Entitlement) => boolean) => {
      for (let i = 0; i < 8; i++) {
        const e = await refresh();
        if (e && isDone(e)) return true;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
      return false;
    },
    [refresh],
  );

  return { ...state, user, refresh, webAction, awaitChange };
}
