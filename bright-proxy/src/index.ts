/**
 * bright-proxy — Bright's Groq proxy, on Cloudflare Workers (free plan, no card).
 *
 * Two ways in, one endpoint (POST /v1/turn):
 *
 *   Authorization: Bearer <Firebase ID token>
 *     A signed-in trainee. The token is verified against Google's published keys, the
 *     trainee's daily turn count is checked and incremented (QuotaCounter), and the request
 *     goes to Groq with Jason's key from the GROQ_API_KEY secret. That key is never put in a
 *     response, a header, or a log line.
 *
 *   X-Groq-Key: <the trainee's own key>   (BYOK)
 *     Forwarded as-is for this one request, never stored or logged, and not metered — it's
 *     the trainee's own quota being spent.
 *
 * If both are sent, BYOK wins: the trainee chose to use their own key.
 *
 * Hosted turns are metered per *drill* (one practice case): the client sends `drill_id` with
 * every turn of a case, and the first turn of a new drill spends one of the month's drills — 10
 * on Free, effectively unlimited on Plus/Pro. Plans come from three payment systems, all
 * merged into one Account per uid (src/account.ts):
 *
 *   POST /webhooks/revenuecat   Google Play + App Store, via RevenueCat
 *   POST /webhooks/paddle       the website, via Paddle
 *   GET  /v1/account            what every client reads: plan, usage, credits
 *   POST /v1/web/cancel | resume | update-payment   managing a website subscription
 *   POST /v1/retention-offer-used                   the app took a store-side exit offer
 */

import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Account } from "./account.ts";
import type { TurnDecision } from "./billing/entitlement.ts";
import { PaddleApi, type PaddleSubscription, type PaddleTransaction, creditsForTransaction, mapSubscription, verifySignature } from "./billing/paddle.ts";
import { type RcEvent, creditsForEvent, fetchSubscriber, isAnonymousId, mapSubscriber } from "./billing/revenuecat.ts";

export { Account };

export interface Env {
  GROQ_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  /** Comma-separated exact origins allowed to call the proxy from a browser. */
  ALLOWED_ORIGINS: string;
  /** Legacy: the pre-billing daily counter. Kept bound so its Durable Object class stays deployed. */
  QUOTA: DurableObjectNamespace<QuotaCounter>;
  ACCOUNT: DurableObjectNamespace<Account>;

  // Billing. Secrets unless noted; every one is optional — unset means that integration is off.
  /** RevenueCat secret API key (sk_…), for reading subscribers. */
  RC_SECRET_KEY?: string;
  /** The exact Authorization header value configured on the RevenueCat webhook. */
  RC_WEBHOOK_AUTH?: string;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  /** Var: "sandbox" or "production". */
  PADDLE_ENV?: string;
  /** Var: JSON map of Paddle price id → "plus_monthly" | "plus_annual" | "pro_monthly" | "pro_annual" | "addon_…". */
  PADDLE_PRICES?: string;
  /** Var: the Paddle discount id for the exit offer (50% off, 3 billing periods). */
  PADDLE_RETENTION_DISCOUNT_ID?: string;
  RESEND_API_KEY?: string;
  /** Var: sender for billing emails, e.g. "Bright <billing@yourdomain>". */
  EMAIL_FROM?: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Hosted turns always use this model — a client doesn't get to pick what Jason pays for. */
const HOSTED_MODEL = "openai/gpt-oss-120b";
const MAX_COMPLETION_TOKENS = 1500;
const MAX_MESSAGES = 80;
const MAX_BODY_BYTES = 200_000;
const ROLES = new Set(["system", "user", "assistant"]);

// Firebase ID tokens are signed by this service account. jose caches the key set per isolate.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    // A browser request from anywhere else gets nothing. Non-browser callers (the Android app,
    // later) send no Origin and are gated by the token check instead.
    if (origin && !cors) return new Response("Origin not allowed.", { status: 403 });

    const url = new URL(request.url);

    // Server-to-server: authenticated by their own signatures, never by browser origin.
    if (url.pathname === "/webhooks/revenuecat" && request.method === "POST") return revenueCatWebhook(request, env);
    if (url.pathname === "/webhooks/paddle" && request.method === "POST") return paddleWebhook(request, env);

    if (url.pathname === "/v1/account" && request.method === "GET") return accountRoute(request, env, url, cors);
    if (url.pathname.startsWith("/v1/web/") && request.method === "POST") return webRoute(request, env, url, cors);
    if (url.pathname === "/v1/retention-offer-used" && request.method === "POST") {
      const user = await verifiedUser(request, env);
      if (!user) return json({ error: "Sign in first.", code: "unauthenticated" }, 401, cors);
      await account(env, user.uid).markRetentionOfferUsed();
      return json(await account(env, user.uid).entitlement(), 200, cors);
    }

    if (url.pathname !== "/v1/turn") return json({ error: "Not found." }, 404, cors);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, cors);

    const parsed = await readBody(request);
    if ("error" in parsed) return json({ error: parsed.error }, 400, cors);

    const byokKey = request.headers.get("X-Groq-Key")?.trim();
    if (byokKey) {
      return forward(byokKey, parsed.model ?? HOSTED_MODEL, parsed.messages, parsed.format, { exposeUpstreamErrors: true }, cors);
    }

    const user = await verifiedUser(request, env);
    if (!user) return json({ error: "Sign in, or add your own Groq key.", code: "unauthenticated" }, 401, cors);

    const acct = account(env, user.uid);
    await acct.touchProfile(user.email, null);
    // Clients from before drill metering send no id; treat each UTC day as one drill for them.
    const drillId = parsed.drillId ?? `legacy-${new Date().toISOString().slice(0, 10)}`;
    const { decision, entitlement } = await acct.consume(drillId);
    if (!decision.allowed) return drillRefusal(decision, cors);

    // Trimmed: a key uploaded from a clipboard can carry a trailing newline, which breaks the header.
    const response = await forward(env.GROQ_API_KEY.trim(), HOSTED_MODEL, parsed.messages, parsed.format, { exposeUpstreamErrors: false }, cors, {
      drillsUsed: entitlement.drillsUsed,
      drillsLimit: entitlement.drillsLimit,
      bonusDrills: entitlement.bonusDrills,
    });
    // A turn that never reached the trainee shouldn't count against them.
    if (!response.ok) await acct.refund(drillId, decision);
    return response;
  },
} satisfies ExportedHandler<Env>;

function account(env: Env, uid: string) {
  return env.ACCOUNT.get(env.ACCOUNT.idFromName(uid));
}

function drillRefusal(decision: Exclude<TurnDecision, { allowed: true }>, cors: Headers | null): Response {
  if (decision.code === "drill_limit") {
    return json(
      { error: "You've used this month's drills.", code: "drill_limit", reason: decision.reason, limit: decision.limit },
      429,
      cors,
    );
  }
  // The client starts a new drill id and retries — that's a new case, and spends a drill.
  return json({ error: "This case has ended. Start a new one.", code: decision.code }, 409, cors);
}

type User = { uid: string; email: string | null };

/** Returns the Firebase user for a valid ID token from this project, or null. */
async function verifiedUser(request: Request, env: Env): Promise<User | null> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    const email = typeof payload.email === "string" && payload.email_verified !== false ? payload.email : null;
    return { uid: payload.sub, email };
  } catch {
    // Expired, forged, or another project's token all look the same from outside.
    return null;
  }
}

// --- Account & website billing ---------------------------------------------------------------

async function accountRoute(request: Request, env: Env, url: URL, cors: Headers | null): Promise<Response> {
  const user = await verifiedUser(request, env);
  if (!user) return json({ error: "Sign in first.", code: "unauthenticated" }, 401, cors);
  const locale = url.searchParams.get("locale");
  const acct = account(env, user.uid);
  await acct.touchProfile(user.email, locale === "ko" || locale === "en" ? locale : null);
  return json(await acct.entitlement(), 200, cors);
}

function paddle(env: Env): PaddleApi | null {
  return env.PADDLE_API_KEY ? new PaddleApi(env.PADDLE_API_KEY, env.PADDLE_ENV !== "production") : null;
}

function paddlePrices(env: Env): Record<string, string> {
  try {
    return JSON.parse(env.PADDLE_PRICES ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Managing a website (Paddle) subscription — from the website or from either app, since it's a
 * server call and not a purchase. Store subscriptions can't be managed here: Apple and Google
 * own those, and the response says where to go instead.
 */
async function webRoute(request: Request, env: Env, url: URL, cors: Headers | null): Promise<Response> {
  const user = await verifiedUser(request, env);
  if (!user) return json({ error: "Sign in first.", code: "unauthenticated" }, 401, cors);
  const api = paddle(env);
  if (!api) return json({ error: "Website billing isn't configured.", code: "not_configured" }, 503, cors);

  const acct = account(env, user.uid);
  const state = await acct.state();
  const entitlement = await acct.entitlement();
  const subId = state.paddleSubscriptionId;
  if (entitlement.source !== null && entitlement.source !== "web") {
    return json({ error: "This plan is managed by its app store.", code: "managed_elsewhere", source: entitlement.source }, 409, cors);
  }
  if (!subId) return json({ error: "No website subscription.", code: "no_subscription" }, 409, cors);

  const body = (await request.json().catch(() => ({}))) as { acceptRetentionOffer?: boolean };
  try {
    let updated: PaddleSubscription;
    switch (url.pathname) {
      case "/v1/web/cancel":
        if (body.acceptRetentionOffer === true) {
          if (state.retentionOfferUsed || !env.PADDLE_RETENTION_DISCOUNT_ID) {
            return json({ error: "Offer not available.", code: "offer_unavailable" }, 409, cors);
          }
          updated = await api.applyDiscount(subId, env.PADDLE_RETENTION_DISCOUNT_ID);
          await acct.markRetentionOfferUsed();
        } else {
          updated = await api.cancelAtPeriodEnd(subId);
        }
        break;
      case "/v1/web/resume":
        updated = await api.resume(subId);
        break;
      case "/v1/web/update-payment": {
        // Dunning, trainee side: Paddle Checkout opens this transaction to take a new card now
        // instead of waiting for the next automatic retry.
        const tx = await api.updatePaymentTransaction(subId);
        return json({ transactionId: tx.id }, 200, cors);
      }
      default:
        return json({ error: "Not found." }, 404, cors);
    }
    const mapped = mapSubscription(updated, paddlePrices(env), Date.now());
    return json(await acct.setSubscriptions({ web: mapped }), 200, cors);
  } catch (err) {
    console.error(`Paddle ${url.pathname} failed for uid=${user.uid}:`, (err as Error).message);
    return json({ error: "Couldn't update the subscription. Try again." }, 502, cors);
  }
}

// --- Webhooks --------------------------------------------------------------------------------

async function revenueCatWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.RC_WEBHOOK_AUTH || request.headers.get("Authorization") !== env.RC_WEBHOOK_AUTH) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { event?: RcEvent } | null;
  const event = body?.event;
  if (!event?.app_user_id || isAnonymousId(event.app_user_id)) return new Response("ignored");
  if (!env.RC_SECRET_KEY) return new Response("RevenueCat not configured", { status: 503 });

  try {
    const acct = account(env, event.app_user_id);
    const state = await acct.state();
    const subscriber = await fetchSubscriber(event.app_user_id, env.RC_SECRET_KEY);
    await acct.setSubscriptions(mapSubscriber(subscriber, Date.now(), state.subs));

    const credits = creditsForEvent(event);
    if (credits) await acct.credit(`rc:${event.id}`, credits);
    if (event.type === "BILLING_ISSUE") await acct.notify("payment_failed", `rc:${event.id}`);
    return new Response("ok");
  } catch (err) {
    // 5xx makes RevenueCat retry; every step above is idempotent.
    console.error(`RevenueCat ${event.type} ${event.id} failed:`, (err as Error).message);
    return new Response("error", { status: 500 });
  }
}

async function paddleWebhook(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  const valid = await verifySignature(request.headers.get("Paddle-Signature"), raw, env.PADDLE_WEBHOOK_SECRET ?? "", Date.now());
  if (!valid) return new Response("Bad signature", { status: 401 });

  const event = JSON.parse(raw) as { event_id: string; event_type: string; data: PaddleSubscription & PaddleTransaction };
  const prices = paddlePrices(env);
  try {
    const uid = await paddleUid(env, event.data.custom_data?.uid, event.data.customer_id);
    if (!uid) {
      console.warn(`Paddle ${event.event_type} ${event.event_id}: no uid`);
      return new Response("ok");
    }
    const acct = account(env, uid);

    if (event.event_type.startsWith("subscription.")) {
      // Re-read: Paddle doesn't guarantee webhook order, and a late event mustn't win.
      const api = paddle(env);
      const latest = api ? await api.getSubscription(event.data.id).catch(() => event.data) : event.data;
      await acct.setSubscriptions(
        { web: mapSubscription(latest, prices, Date.now()) },
        { paddleCustomerId: latest.customer_id, paddleSubscriptionId: latest.id },
      );
      if (latest.status === "past_due") {
        await acct.notify("payment_failed", `paddle:${latest.id}:${latest.current_billing_period?.starts_at ?? ""}`);
      }
    } else if (event.event_type === "transaction.completed") {
      await acct.credit(`paddle:${event.event_id}`, creditsForTransaction(event.data, prices));
    } else if (event.event_type === "transaction.payment_failed" && event.data.subscription_id) {
      await acct.notify("payment_failed", `paddle:${event.data.id}`);
    }
    return new Response("ok");
  } catch (err) {
    console.error(`Paddle ${event.event_type} ${event.event_id} failed:`, (err as Error).message);
    return new Response("error", { status: 500 });
  }
}

/** custom_data.uid when present (and remembered for this customer), else the remembered link. */
async function paddleUid(env: Env, fromCustomData: string | undefined, customerId: string | null | undefined): Promise<string | null> {
  const link = customerId ? env.ACCOUNT.get(env.ACCOUNT.idFromName(`paddle:${customerId}`)) : null;
  if (fromCustomData) {
    if (link) await link.link(fromCustomData);
    return fromCustomData;
  }
  return link ? link.linkedUid() : null;
}

async function readBody(
  request: Request,
): Promise<{ messages: ChatMessage[]; model?: string; drillId?: string; format: "json" | "text" } | { error: string }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: "Request too large." };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Malformed request." };
  }
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return { error: "No messages to send." };

  // Rebuilt from an allowlist rather than passed through, so nothing else reaches Groq.
  const messages: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (typeof role !== "string" || !ROLES.has(role) || typeof content !== "string") {
      return { error: "Malformed message." };
    }
    messages.push({ role: role as ChatMessage["role"], content });
  }
  const model = (body as { model?: unknown }).model;
  const drill = (body as { drill_id?: unknown }).drill_id;
  const drillId = typeof drill === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(drill) ? drill : undefined;
  // "text" is for plain-prose replies (side questions, the expert debrief); the default stays JSON.
  const format = (body as { format?: unknown }).format === "text" ? "text" : "json";
  return { messages, model: typeof model === "string" && model ? model : undefined, drillId, format };
}

async function forward(
  key: string,
  model: string,
  messages: ChatMessage[],
  format: "json" | "text",
  { exposeUpstreamErrors }: { exposeUpstreamErrors: boolean },
  cors: Headers | null,
  usage?: { drillsUsed: number; drillsLimit: number | null; bonusDrills: number },
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
        max_completion_tokens: MAX_COMPLETION_TOKENS,
      }),
    });
  } catch {
    return json({ error: "Couldn't reach Groq." }, 502, cors);
  }

  const payload = (await upstream.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
    | null;

  if (!upstream.ok) {
    // On the hosted path Groq's message is about Jason's account, not the trainee's — keep it generic.
    const message = exposeUpstreamErrors
      ? (payload?.error?.message ?? `Groq request failed (HTTP ${upstream.status}).`)
      : "The AI service is busy right now. Try again in a moment.";
    // BYOK keeps Groq's status (a bad key is the trainee's 401 to fix); hosted failures are ours.
    const status = exposeUpstreamErrors ? upstream.status : upstream.status === 429 ? 503 : 502;
    return json({ error: message }, status, cors);
  }

  const reply = payload?.choices?.[0]?.message?.content;
  if (!reply) return json({ error: "Empty response from the model." }, 502, cors);
  if (format === "text") return json(usage ? { text: reply.trim(), usage } : { text: reply.trim() }, 200, cors);

  // The prompt demands a bare JSON object, but models sometimes fence it anyway.
  const cleaned = reply.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let turn: unknown;
  try {
    turn = JSON.parse(cleaned);
  } catch {
    return json({ error: "The model didn't return the expected JSON." }, 502, cors);
  }
  return json(usage ? { turn, usage } : { turn }, 200, cors);
}

function corsHeaders(origin: string | null, env: Env): Headers | null {
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Groq-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}

function json(body: unknown, status: number, cors: Headers | null): Response {
  const headers = new Headers(cors ?? undefined);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

type Usage = { day: string; count: number };

/**
 * LEGACY — the pre-billing daily turn counter, superseded by `Account`. No longer called; it stays
 * exported only because a deployed Durable Object class can't be removed without a
 * `deleted_classes` migration, which would also drop its data. Remove both together later.
 *
 * One instance per signed-in trainee (named by uid): today's turn count. SQLite-backed, which
 * is what the Workers free plan supports. Resets when the UTC day changes.
 */
export class QuotaCounter extends DurableObject<Env> {
  async consume(limit: number): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
    const day = utcDay();
    const stored = await this.ctx.storage.get<Usage>("usage");
    const count = stored?.day === day ? stored.count : 0;
    const resetAt = nextUtcMidnight();
    if (count >= limit) return { allowed: false, remaining: 0, resetAt };
    await this.ctx.storage.put<Usage>("usage", { day, count: count + 1 });
    return { allowed: true, remaining: limit - count - 1, resetAt };
  }

  async refund(): Promise<void> {
    const stored = await this.ctx.storage.get<Usage>("usage");
    if (stored?.day === utcDay() && stored.count > 0) {
      await this.ctx.storage.put<Usage>("usage", { day: stored.day, count: stored.count - 1 });
    }
  }
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcMidnight(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
