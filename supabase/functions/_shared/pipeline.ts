import { corsHeaders } from "./cors.ts";
import { errorResponse, type ErrorCode } from "./errors.ts";
import type { AppConfig, Deps, LogEntry, Profile, Quota } from "./types.ts";

export interface Ctx {
  deps: Deps;
  fn: LogEntry["fn"];
  uid: string;
  cors: Headers;
  profile: Profile;
  config: AppConfig;
  body: unknown;
  t0: number;
}

export type Guarded = { res: Response } | { ctx: Ctx };

export function finish(deps: Deps, fn: LogEntry["fn"], t0: number, res: Response, uid?: string, code?: string, extra: Partial<LogEntry> = {}) {
  deps.log({ fn, uid, status: res.status, code, latency_ms: Date.now() - t0, ...extra });
  return res;
}

/** Steps shared by every function: CORS, method, body size, JWT, rate limit, profile, age gate. */
export async function guard(req: Request, deps: Deps, fn: LogEntry["fn"], maxBytes: number): Promise<Guarded> {
  const t0 = Date.now();
  const { headers: cors, originOk } = corsHeaders(req, deps.allowedOrigins);
  const reject = (code: ErrorCode, uid?: string, extra?: Record<string, unknown>): Guarded => ({
    res: finish(deps, fn, t0, errorResponse(code, cors, extra), uid, code),
  });

  if (!originOk) return reject("forbidden_origin");
  if (req.method === "OPTIONS") return { res: new Response(null, { status: 204, headers: cors }) };
  if (req.method !== "POST") return reject("invalid_input");

  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return reject("unauthenticated");
  const uid = await deps.verifyUser(token).catch(() => null);
  if (!uid) return reject("unauthenticated");

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return reject("payload_too_large", uid);
  const raw = await req.arrayBuffer();
  if (raw.byteLength > maxBytes) return reject("payload_too_large", uid);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return reject("invalid_input", uid);
  }

  const config = await deps.store.getConfig();
  if (!(await deps.store.checkRateLimit(uid, config.rateLimitPerMinute))) return reject("rate_limited", uid);

  const profile = await deps.store.getProfile(uid);
  if (!profile) return reject("unauthenticated", uid);
  if (!profile.age_confirmed) return reject("age_required", uid);

  return { ctx: { deps, fn, uid, cors, profile, config, body, t0 } };
}

export type Reserved = { res: Response } | { quota: Quota };

/** Global budget kill switch, then the atomic per-user quota. Never calls Groq itself. */
export async function reserve(ctx: Ctx, n: number): Promise<Reserved> {
  const { deps, uid, cors, fn, t0 } = ctx;
  if ((await deps.store.getGlobalCost()) >= deps.dailyBudgetUsd) {
    return { res: finish(deps, fn, t0, errorResponse("budget_reached", cors), uid, "budget_reached") };
  }
  const quota = await deps.store.consumeQuota(uid, n);
  if (!quota.allowed) {
    return {
      res: finish(deps, fn, t0, errorResponse("daily_limit", cors, { resets_at: quota.resets_at, limit: quota.limit }), uid, "daily_limit"),
    };
  }
  return { quota };
}
