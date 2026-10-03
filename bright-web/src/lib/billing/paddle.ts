/**
 * Paddle Billing on the website. Paddle is the merchant of record: it sells to the visitor,
 * collects VAT, retries failed renewals and handles receipts — so checkout is Paddle's overlay
 * (cards, Apple Pay and Google Pay where the browser supports them), opened on top of this page.
 *
 * Build-time config (all public — Paddle client tokens and price ids are meant to ship to the
 * browser):
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   test_… / live_…
 *   NEXT_PUBLIC_PADDLE_ENV            "sandbox" | "production"
 *   NEXT_PUBLIC_PADDLE_PRICES         JSON: {"plus_monthly":"pri_…","plus_annual":"pri_…",…,"addon_drill_pack":"pri_…"}
 * Unset, the pricing page still renders (with fallback prices) and says checkout isn't set up.
 */

type PaddleEvent = { name: string; data?: unknown };

type PaddleGlobal = {
  Environment: { set: (env: "sandbox" | "production") => void };
  Initialize: (opts: { token: string; eventCallback?: (e: PaddleEvent) => void }) => void;
  Checkout: {
    open: (opts: {
      items?: { priceId: string; quantity: number }[];
      transactionId?: string;
      customer?: { email: string };
      customData?: Record<string, string>;
      settings?: { displayMode?: "overlay"; locale?: string; theme?: "light" | "dark"; allowLogout?: boolean };
    }) => void;
  };
  PricePreview: (req: { items: { priceId: string; quantity: number }[] }) => Promise<{
    data: {
      details: {
        lineItems: {
          price: { id: string; billingCycle?: { interval: string } | null };
          formattedTotals: { total: string };
          totals: { total: string };
        }[];
      };
      currencyCode: string;
    };
  }>;
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const ENV = process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";

export const PRICE_IDS: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_PADDLE_PRICES ?? "{}");
  } catch {
    return {};
  }
})();

export const paddleConfigured = TOKEN.length > 0 && Object.keys(PRICE_IDS).length > 0;

const listeners = new Set<(e: PaddleEvent) => void>();
let loading: Promise<PaddleGlobal | null> | null = null;

/** Loads Paddle.js once, from Paddle's CDN (it must not be self-hosted or bundled). */
export function loadPaddle(): Promise<PaddleGlobal | null> {
  if (!paddleConfigured || typeof window === "undefined") return Promise.resolve(null);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) return resolve(null);
      paddle.Environment.set(ENV);
      paddle.Initialize({ token: TOKEN, eventCallback: (e) => listeners.forEach((l) => l(e)) });
      resolve(paddle);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}

/** Subscribes to Paddle checkout events (e.g. "checkout.completed"). Returns an unsubscribe. */
export function onPaddleEvent(listener: (e: PaddleEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Opens checkout for one or more price keys. `uid` rides along as custom data — it's how
 * bright-proxy's webhook knows which Bright account the purchase belongs to.
 */
export async function openCheckout(opts: {
  keys: string[];
  uid: string;
  email: string;
  locale: "en" | "ko";
  extra?: Record<string, string>;
}): Promise<boolean> {
  const paddle = await loadPaddle();
  const items = opts.keys.map((k) => PRICE_IDS[k]).filter(Boolean).map((priceId) => ({ priceId, quantity: 1 }));
  if (!paddle || items.length === 0) return false;
  paddle.Checkout.open({
    items,
    customer: opts.email ? { email: opts.email } : undefined,
    customData: { uid: opts.uid, ...(opts.extra ?? {}) },
    settings: { displayMode: "overlay", locale: opts.locale, allowLogout: false },
  });
  return true;
}

/** Dunning: Paddle's checkout for a past-due subscription's "update payment method" transaction. */
export async function openPaymentUpdate(transactionId: string): Promise<boolean> {
  const paddle = await loadPaddle();
  if (!paddle) return false;
  paddle.Checkout.open({ transactionId, settings: { displayMode: "overlay", allowLogout: false } });
  return true;
}

/**
 * Prices localised to the visitor (Paddle picks country and currency from their IP), keyed
 * like PRICE_IDS. Empty if Paddle isn't configured or the preview fails.
 */
export async function previewPrices(): Promise<Record<string, string>> {
  const paddle = await loadPaddle();
  if (!paddle) return {};
  try {
    const items = Object.values(PRICE_IDS).map((priceId) => ({ priceId, quantity: 1 }));
    const preview = await paddle.PricePreview({ items });
    const byId = new Map(preview.data.details.lineItems.map((li) => [li.price.id, li.formattedTotals.total]));
    return Object.fromEntries(Object.entries(PRICE_IDS).map(([key, id]) => [key, byId.get(id) ?? ""]).filter(([, v]) => v));
  } catch {
    return {};
  }
}
