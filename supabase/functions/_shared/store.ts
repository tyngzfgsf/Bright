// deno-lint-ignore-file no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadLlmConfig } from "./llm-config.ts";
import type { AppConfig, Deps, Lang, Price, Profile, Quota, Scenario, Store } from "./types.ts";

/** Production wiring. Uses the service-role client that Supabase injects into Edge Functions. */
export function productionDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      return data ? { ...(data as any), language: (data as any).language as Lang } : null;
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
  };

  return {
    store,
    async verifyUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    llm: () => loadLlmConfig((n) => Deno.env.get(n)),
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    dailyBudgetUsd: Number(Deno.env.get("DAILY_BUDGET_USD") ?? "0.30"),
    fetch: (...a) => fetch(...a),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // Metadata only: user id, tokens, cost, status, latency. Never message content.
    log: (e) => console.log(JSON.stringify(e)),
  };
}
