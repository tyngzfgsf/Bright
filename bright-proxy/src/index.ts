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
 */

import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Env {
  GROQ_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  /** Comma-separated exact origins allowed to call the proxy from a browser. */
  ALLOWED_ORIGINS: string;
  /** Turns per signed-in trainee per UTC day. */
  DAILY_TURN_LIMIT: string;
  QUOTA: DurableObjectNamespace<QuotaCounter>;
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
    if (url.pathname !== "/v1/turn") return json({ error: "Not found." }, 404, cors);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, cors);

    const parsed = await readBody(request);
    if ("error" in parsed) return json({ error: parsed.error }, 400, cors);

    const byokKey = request.headers.get("X-Groq-Key")?.trim();
    if (byokKey) {
      return forward(byokKey, parsed.model ?? HOSTED_MODEL, parsed.messages, { exposeUpstreamErrors: true }, cors);
    }

    const uid = await verifiedUid(request, env);
    if (!uid) return json({ error: "Sign in, or add your own Groq key.", code: "unauthenticated" }, 401, cors);

    const limit = Number.parseInt(env.DAILY_TURN_LIMIT, 10) || 40;
    const quota = env.QUOTA.get(env.QUOTA.idFromName(uid));
    const usage = await quota.consume(limit);
    if (!usage.allowed) {
      return json(
        { error: "You've used today's free turns.", code: "quota_exceeded", limit, resetAt: usage.resetAt },
        429,
        cors,
      );
    }

    const response = await forward(env.GROQ_API_KEY, HOSTED_MODEL, parsed.messages, { exposeUpstreamErrors: false }, cors, {
      remaining: usage.remaining,
      limit,
      resetAt: usage.resetAt,
    });
    // A turn that never reached the trainee shouldn't count against them.
    if (!response.ok) await quota.refund();
    return response;
  },
} satisfies ExportedHandler<Env>;

/** Returns the Firebase uid for a valid ID token from this project, or null. */
async function verifiedUid(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    // Expired, forged, or another project's token all look the same from outside.
    return null;
  }
}

async function readBody(request: Request): Promise<{ messages: ChatMessage[]; model?: string } | { error: string }> {
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
  return { messages, model: typeof model === "string" && model ? model : undefined };
}

async function forward(
  key: string,
  model: string,
  messages: ChatMessage[],
  { exposeUpstreamErrors }: { exposeUpstreamErrors: boolean },
  cors: Headers | null,
  quota?: { remaining: number; limit: number; resetAt: string },
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
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

  // The prompt demands a bare JSON object, but models sometimes fence it anyway.
  const cleaned = reply.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let turn: unknown;
  try {
    turn = JSON.parse(cleaned);
  } catch {
    return json({ error: "The model didn't return the expected JSON." }, 502, cors);
  }
  return json(quota ? { turn, quota } : { turn }, 200, cors);
}

function corsHeaders(origin: string | null, env: Env): Headers | null {
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
