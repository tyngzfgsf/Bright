// deno-lint-ignore-file no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeJwtVerifier, pickSecretKey } from "./jwt.ts";
import { loadLlmConfig } from "./llm-config.ts";
import type {
  AppConfig, ChatTurnClaim, Deps, Lang, Price, Profile, QuestionCandidate, QuestionKeyed, Quota, Scenario, SessionRow, Store,
} from "./types.ts";

// deno-lint-ignore no-explicit-any
const first = (data: any) => (Array.isArray(data) ? data[0] : data);
const iso = (d: Date) => d.toISOString();

// deno-lint-ignore no-explicit-any
function toSession(r: any): SessionRow {
  return {
    id: r.id, scenario_id: r.scenario_id, state: r.state, turn_count: r.turn_count, status: r.status,
    language: r.language ?? null, max_turns: r.max_turns, end_reason: r.end_reason ?? null,
    graded_at: r.graded_at ?? null, score: r.score ?? null,
    missed_rubric_ids: Array.isArray(r.missed_rubric_ids) ? r.missed_rubric_ids.filter((x: unknown) => typeof x === "string") : [],
  };
}
// deno-lint-ignore no-explicit-any
function toCandidate(r: any): QuestionCandidate {
  return {
    id: r.id, scenario_id: r.scenario_id, rubric_item_id: r.rubric_item_id, skill_tag: r.skill_tag, language: r.language,
    type: r.type, stem: r.stem, options: r.options, difficulty: Number(r.difficulty), attempts: Number(r.attempts ?? 0),
    last_answered_at: r.last_answered_at ?? null, due_at: r.due_at ?? null,
  };
}

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
        questionsRateLimitPerMinute: Number(m.get("questions_rate_limit_per_minute") ?? 30),
        reasoningEffort: String(m.get("reasoning_effort") ?? "low"),
      };
      cfg = { at: Date.now(), value };
      return value;
    },
    async checkRateLimit(uid, max, scope) {
      const { data, error } = await admin.rpc("check_rate_limit", { p_user: uid, p_max: max, p_scope: scope });
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
    // Sessions. Each RPC filters on p_user inside SQL (tested with two users in tests/sessions_rls.sql).
    async createSession(uid, scenarioId, state, language, maxTurns, now) {
      const { data, error } = await admin.rpc("create_session", {
        p_user: uid, p_scenario: scenarioId, p_state: state, p_language: language, p_max_turns: maxTurns, p_now: iso(now),
      });
      if (error || typeof data !== "string") throw error ?? new Error("create_session failed");
      return data;
    },
    async getSession(uid, id, now): Promise<SessionRow | null> {
      const { data, error } = await admin.rpc("get_session", { p_user: uid, p_id: id, p_now: iso(now) });
      if (error) throw error;
      const r = first(data);
      return r ? toSession(r) : null;
    },
    async claimChatTurn(uid, id, now): Promise<ChatTurnClaim> {
      const { data, error } = await admin.rpc("claim_chat_turn", { p_user: uid, p_id: id, p_now: iso(now) });
      if (error) throw error;
      const r = first(data);
      return { ok: r.o_ok === true, reason: r.o_reason ?? null, turn_count: r.o_turn_count, max_turns: r.o_max_turns, status: r.o_status ?? null };
    },
    async unclaimChatTurn(uid, id, claimed) {
      await admin.rpc("unclaim_chat_turn", { p_user: uid, p_id: id, p_turn_count: claimed });
    },
    async finishSession(uid, id, now) {
      const { data, error } = await admin.rpc("finish_session", { p_user: uid, p_id: id, p_now: iso(now) });
      if (error) throw error;
      return typeof data === "string" ? data as SessionRow["status"] : null;
    },
    async recordGrade(uid, id, score, items, now) {
      const { data, error } = await admin.rpc("record_grade", { p_user: uid, p_id: id, p_score: score, p_items: items, p_now: iso(now) });
      if (error) throw error;
      return data === true;
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
    // Question bank: the SQL functions return approved rows only, and only question_for_answer carries the key.
    async questionCandidates(uid, language) {
      const { data, error } = await admin.rpc("question_candidates", { p_user: uid, p_language: language });
      if (error) throw error;
      return (data ?? []).map(toCandidate);
    },
    async questionForAnswer(uid, id): Promise<QuestionKeyed | null> {
      const { data, error } = await admin.rpc("question_for_answer", { p_user: uid, p_id: id });
      if (error) throw error;
      const r = first(data);
      if (!r) return null;
      return {
        id: r.id, skill_tag: r.skill_tag, type: r.type, options: r.options, correct_option_ids: r.correct_option_ids,
        explanation: r.explanation, ease: r.ease === null ? null : Number(r.ease),
        interval_days: r.interval_days ?? null, attempts: Number(r.attempts), correct_streak: Number(r.correct_streak),
      };
    },
    async enrollQuestions(uid, ids, due) {
      if (ids.length === 0) return;
      const { error } = await admin.rpc("enroll_questions", { p_user: uid, p_ids: ids, p_due: iso(due) });
      if (error) throw error;
    },
    async recordAnswer(uid, a, now) {
      const { data, error } = await admin.rpc("record_answer", {
        p_user: uid, p_question: a.questionId, p_skill: a.skillTag, p_correct: a.correct, p_ease: a.ease,
        p_interval: a.intervalDays, p_streak: a.correctStreak, p_expected_attempts: a.expectedAttempts,
        p_context: a.context, p_now: iso(now),
      });
      if (error) throw error;
      return data === true;
    },
    async reviewDue(uid, now) {
      const { data, error } = await admin.rpc("review_due", { p_user: uid, p_now: iso(now) });
      if (error) throw error;
      return (data ?? []).map(toCandidate);
    },
    async reviewDueCount(uid, now) {
      const { data, error } = await admin.rpc("review_due_count", { p_user: uid, p_now: iso(now) });
      if (error) throw error;
      return Number(data ?? 0);
    },
    async streak(uid, now) {
      const { data, error } = await admin.rpc("streak", { p_user: uid, p_now: iso(now) });
      if (error) throw error;
      const r = first(data);
      return { current: Number(r?.o_current ?? 0), today_counts: r?.o_today_counts === true };
    },
    async weakestSkills(uid, limit) {
      const { data, error } = await admin.rpc("weakest_skills", { p_user: uid, p_limit: limit });
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({ skill_tag: r.skill_tag, attempts: Number(r.attempts), misses: Number(r.misses) }));
    },
    async reportQuestion(uid, questionId, reason) {
      const { data, error } = await admin.rpc("report_question", { p_user: uid, p_question: questionId, p_reason: reason });
      if (error) throw error;
      return data === true;
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
    now: () => Date.now(),
    // Metadata only: user id, tokens, cost, status, latency. Never message content.
    log: (e) => console.log(JSON.stringify(e)),
  };
}
