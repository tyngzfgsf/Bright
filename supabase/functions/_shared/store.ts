// deno-lint-ignore-file no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeJwtVerifier, pickSecretKey } from "./jwt.ts";
import { loadLlmConfig } from "./llm-config.ts";
import type { AppConfig, Deps, Lang, Price, Profile, Quota, Scenario, SessionRow, Store } from "./types.ts";

/** Production wiring. Database access uses a secret key (bypasses RLS) and exists only inside Edge Functions. */
export function productionDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  // Current key system: the secret key comes from SUPABASE_SECRET_KEYS (injected into Edge Functions only),
  // and user JWTs are verified against SUPABASE_JWKS. Legacy anon/service_role variables are not used.
  const secretKey = pickSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEYS is not available"); // never echo key material
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verifyJwt = makeJwtVerifier(Deno.env.get("SUPABASE_JWKS"), url);

  let cfg: { at: number; value: AppConfig } | null = null;
  const store: Store = {
    async getProfile(uid): Promise<Profile | null> {
      const { data } = await admin.from("profiles").select("age_confirmed, tiers(*)").eq("id", uid).maybeSingle();
      // deno-lint-ignore no-explicit-any
      const t = (data as any)?.tiers;
      // deno-lint-ignore no-explicit-any
      return data && t ? { age_confirmed: (data as any).age_confirmed, tier: t } : null;
    },
    async getScenario(id): Promise<Scenario | null> {
      const { data } = await admin.from("scenarios").select("*").eq("id", id).eq("active", true).maybeSingle();
      // deno-lint-ignore no-explicit-any
      return data ? { ...(data as any), language: (data as any).language as Lang, sim: (data as any).sim ?? null } : null;
    },
    async getConfig(): Promise<AppConfig> {
      if (cfg && Date.now() - cfg.at < 60_000) return cfg.value;
      const { data } = await admin.from("app_config").select("key, value");
      const m = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
      const value: AppConfig = {
        prices: (m.get("prices") ?? {}) as Record<string, Price>,
        rateLimitPerMinute: Number(m.get("rate_limit_per_minute") ?? 6),
        reasoningEffort: String(m.get("reasoning_effort") ?? "low"),
      };
      cfg = { at: Date.now(), value };
      return value;
    },
    async checkRateLimit(uid, max) {
      const { data, error } = await admin.rpc("check_rate_limit", { p_user: uid, p_max: max });
      if (error) throw error;
      return data === true;
    },
    async getGlobalCost() {
      const { data, error } = await admin.rpc("get_global_cost");
      if (error) throw error;
      return Number(data ?? 0);
    },
    async consumeQuota(uid, n): Promise<Quota> {
      const { data, error } = await admin.rpc("consume_quota", { p_user: uid, p_n: n });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      return { allowed: r.o_allowed, remaining: r.o_remaining, limit: r.o_limit, day: r.o_day, resets_at: r.o_resets_at };
    },
    async refundQuota(uid, n, day) {
      await admin.rpc("refund_quota", { p_user: uid, p_n: n, p_day: day });
    },
    async recordUsage(uid, input, output, costUsd) {
      await admin.rpc("record_usage", { p_user: uid, p_in: input, p_out: output, p_cost: costUsd });
    },
    // Simulation sessions. Each RPC filters on p_user inside SQL (tested with two users in tests/sessions_rls.sql).
    async createSession(uid, scenarioId, state) {
      const { data, error } = await admin.rpc("create_session", { p_user: uid, p_scenario: scenarioId, p_state: state });
      if (error || typeof data !== "string") throw error ?? new Error("create_session failed");
      return data;
    },
    async getSession(uid, id): Promise<SessionRow | null> {
      const { data, error } = await admin.rpc("get_session", { p_user: uid, p_id: id });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      return r ? { id: r.id, scenario_id: r.scenario_id, state: r.state, turn_count: r.turn_count, status: r.status } : null;
    },
    async claimSessionTurn(uid, id, expected) {
      const { data, error } = await admin.rpc("claim_session_turn", { p_user: uid, p_id: id, p_expected: expected });
      if (error) throw error;
      return data === true;
    },
    async commitSessionTurn(uid, id, expected, state, status) {
      const { data, error } = await admin.rpc("commit_session_turn", { p_user: uid, p_id: id, p_expected: expected, p_state: state, p_status: status });
      if (error) throw error;
      return data === true;
    },
    async releaseSessionTurn(uid, id) {
      await admin.rpc("release_session_turn", { p_user: uid, p_id: id });
    },
    async endSession(uid, id) {
      const { data, error } = await admin.rpc("end_session", { p_user: uid, p_id: id });
      if (error) throw error;
      return typeof data === "string" ? data as SessionRow["status"] : null;
    },
  };

  return {
    store,
    verifyUser: (token) => verifyJwt(token),
    llm: () => loadLlmConfig((n) => Deno.env.get(n)),
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    dailyBudgetUsd: Number(Deno.env.get("DAILY_BUDGET_USD") ?? "0.30"),
    fetch: (...a) => fetch(...a),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // Metadata only: user id, tokens, cost, status, latency. Never message content.
    log: (e) => console.log(JSON.stringify(e)),
  };
}
