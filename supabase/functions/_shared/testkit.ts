import { loadLlmConfig } from "./llm-config.ts";
import { type AuthoredScenario, buildRows } from "./sim/seedgen.ts";
import { IDLE_MINUTES, REVIEW_DAILY_CAP } from "./config.ts";
import type {
  AnswerRecord, AppConfig, ChatTurnClaim, Deps, Lang, LogEntry, Profile, QuestionCandidate, QuestionKeyed, Quota, Scenario,
  SessionRow, SessionStatus, SkillStat, Store,
} from "./types.ts";

export const UID_A = "11111111-1111-4111-8111-111111111111";
export const UID_B = "22222222-2222-4222-8222-222222222222";
export const SCENARIO_EN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SCENARIO_KO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Pre-created chat sessions (SCENARIO_EN, generous cap) so tests that are not about sessions can just chat. */
export const SESSION_A = "5e55a000-0000-4000-8000-00000000000a";
export const SESSION_B = "5e55b000-0000-4000-8000-00000000000b";
export const SCENARIO_SHORT = "cccccccc-0000-4ccc-8ccc-cccccccccccc";
export const SIM_EN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const SIM_KO = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const SIM_BROKEN = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/** The real worked scenario from supabase/scenarios, so handler tests exercise the shipped rules. */
export function loadAuthored(name: string): AuthoredScenario {
  return JSON.parse(Deno.readTextFileSync(new URL(`../../scenarios/${name}.json`, import.meta.url)));
}
const anaphylaxis = buildRows(loadAuthored("anaphylaxis-sim"));
const simScenario = (id: string, lang: "en" | "ko"): Scenario => {
  const r = anaphylaxis.find((x) => x.language === lang)!;
  return { id, slug: r.slug, language: lang, title: r.title, system_prompt: r.system_prompt, rubric: r.rubric, sim: r.sim, max_turns: 15 };
};

export const scenarios: Scenario[] = [
  {
    id: SCENARIO_EN, slug: "cardiac-arrest", language: "en", title: "Cardiac arrest",
    sim: null,
    max_turns: 15,
    system_prompt: "An adult collapsed in a public place.",
    rubric: [
      { id: "CA-CPR", text: "Starts compressions", points: 3, tags: ["circulation"] },
      { id: "CA-HELP", text: "Calls for help", points: 1, tags: ["escalation", "communication"] },
    ],
  },
  { id: SCENARIO_KO, slug: "cardiac-arrest", language: "ko", title: "심정지", system_prompt: "쓰러진 성인", rubric: [{ id: "CA-CPR", text: "가슴압박", points: 1, tags: ["circulation"] }], sim: null, max_turns: 15 },
  // A short chat scenario (turn cap 3) for cap tests.
  {
    id: SCENARIO_SHORT, slug: "short-drill", language: "en", title: "Short drill", sim: null, max_turns: 3,
    system_prompt: "A short drill.", rubric: [{ id: "SH-ONE", text: "Does the one thing", points: 1, tags: ["assessment"] }],
  },
  simScenario(SIM_EN, "en"),
  simScenario(SIM_KO, "ko"),
  // A sim column that fails validation must behave like "not a simulation scenario", never crash.
  { ...simScenario(SIM_BROKEN, "en"), slug: "broken-sim", sim: { version: 1, nonsense: true } },
];

interface FakeSession {
  uid: string;
  locked: boolean;
  last_activity: number;
  row: SessionRow;
}

/** A question row as stored (with its key and status). Only FakeStore sees this shape. */
export interface FakeQuestion extends Omit<QuestionCandidate, "attempts" | "last_answered_at" | "due_at"> {
  correct_option_ids: string[];
  explanation: string;
  status: "draft" | "approved" | "retired";
}

interface FakeProgress { ease: number; interval_days: number; due_at: number; attempts: number; correct_streak: number; last_answered_at: number | null }

const DAY = 86_400_000;
/** The local calendar day of an instant in an IANA timezone, as YYYY-MM-DD (same rule as SQL local_day()). */
export function localDay(at: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

export class FakeStore implements Store {
  profiles = new Map<string, Profile>();
  used = new Map<string, number>();
  hits = new Map<string, number>();
  globalCost = 0;
  usage: { uid: string; input: number; output: number; cost: number }[] = [];
  refunds = 0;
  sessions = new Map<string, FakeSession>();
  private nextSession = 1;
  /** Test hook: make commitSessionTurn throw once (simulates a database failure after the LLM calls). */
  failCommit = false;
  /** Test hook: runs inside claimSessionTurn right after the claim succeeds (to race a second request). */
  onClaim: (() => Promise<void>) | null = null;
  // ---- question bank state
  questions: FakeQuestion[] = [];
  progress = new Map<string, FakeProgress>(); // `${uid}|${questionId}`
  skills = new Map<string, { attempts: number; misses: number; last_missed_at: number | null }>(); // `${uid}|${tag}`
  activity = new Map<string, { sessions_completed: number; questions_answered: number; reviews_answered: number; review_completed: boolean }>(); // `${uid}|${day}`
  reports: { uid: string; question_id: string; reason: string | null }[] = [];
  timezones = new Map<string, string>();
  /** Every rate-limit check, with its scope (to prove the question functions use their own bucket). */
  rateChecks: { uid: string; max: number; scope: string }[] = [];
  config: AppConfig = {
    prices: {
      "test/chat-model": { input: 0.1, cached_input: 0.05, output: 0.4 },
      "test/grade-model": { input: 0.2, cached_input: 0.1, output: 0.8 },
    },
    rateLimitPerMinute: 1000,
    questionsRateLimitPerMinute: 1000,
    reasoningEffort: "low",
  };
  constructor(limit = 15) {
    for (const uid of [UID_A, UID_B]) {
      this.profiles.set(uid, {
        age_confirmed: true,
        tier: { name: "free", daily_message_limit: limit, chat_model: null, grade_model: null, max_output_tokens: 321 },
      });
    }
    for (const [uid, id] of [[UID_A, SESSION_A], [UID_B, SESSION_B]]) {
      this.sessions.set(id, {
        uid, locked: false, last_activity: Date.now(),
        row: {
          id, scenario_id: SCENARIO_EN, state: {}, turn_count: 0, status: "active", language: "en", max_turns: 60,
          end_reason: null, graded_at: null, score: null, missed_rubric_ids: [],
        },
      });
    }
  }
  getProfile(uid: string) { return Promise.resolve(this.profiles.get(uid) ?? null); }
  getScenario(id: string) { return Promise.resolve(scenarios.find((s) => s.id === id) ?? null); }
  getConfig() { return Promise.resolve(this.config); }
  checkRateLimit(uid: string, max: number, scope: "llm" | "questions") {
    this.rateChecks.push({ uid, max, scope });
    const key = `${uid}|${scope}`;
    const n = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, n);
    return Promise.resolve(n <= max);
  }
  getGlobalCost() { return Promise.resolve(this.globalCost); }
  // Synchronous check-and-increment: same contract as the SQL function (atomic decision).
  consumeQuota(uid: string, n: number): Promise<Quota> {
    const limit = this.profiles.get(uid)!.tier.daily_message_limit;
    const used = this.used.get(uid) ?? 0;
    const base = { limit, day: "2026-10-03", resets_at: "2026-10-03T15:00:00.000Z" };
    if (used + n > limit) return Promise.resolve({ allowed: false, remaining: Math.max(limit - used, 0), ...base });
    this.used.set(uid, used + n);
    return Promise.resolve({ allowed: true, remaining: limit - used - n, ...base });
  }
  refundQuota(uid: string, n: number) {
    this.refunds += n;
    this.used.set(uid, Math.max((this.used.get(uid) ?? 0) - n, 0));
    return Promise.resolve();
  }
  recordUsage(uid: string, input: number, output: number, cost: number) {
    this.usage.push({ uid, input, output, cost });
    this.globalCost += cost;
    return Promise.resolve();
  }

  // ---- sessions: same contract as the SQL functions (every call scoped to uid; a foreign session is "not found").
  tz(uid: string) { return this.timezones.get(uid) ?? "Asia/Seoul"; }
  private bumpActivity(uid: string, at: number, f: (a: { sessions_completed: number; questions_answered: number; reviews_answered: number; review_completed: boolean }) => void) {
    const key = `${uid}|${localDay(at, this.tz(uid))}`;
    const a = this.activity.get(key) ?? { sessions_completed: 0, questions_answered: 0, reviews_answered: 0, review_completed: false };
    f(a);
    this.activity.set(key, a);
  }
  /** Mirrors the sessions_on_complete trigger. */
  private setStatus(e: FakeSession, status: SessionStatus, reason: SessionRow["end_reason"], at: number) {
    const was = e.row.status;
    e.row.status = status;
    e.row.end_reason = reason;
    if (was === "active" && status === "completed" && e.row.turn_count >= 1) this.bumpActivity(e.uid, at, (a) => a.sessions_completed++);
  }
  private expireIdle(uid: string, now: Date) {
    for (const e of this.sessions.values()) {
      if (e.uid === uid && e.row.status === "active" && e.last_activity < now.getTime() - IDLE_MINUTES * 60_000) {
        this.setStatus(e, "abandoned", "inactive", e.last_activity + IDLE_MINUTES * 60_000);
        e.locked = false;
      }
    }
  }
  createSession(uid: string, scenarioId: string, state: unknown, language: Lang = "en", maxTurns = 15, now: Date = new Date()) {
    this.expireIdle(uid, now);
    const active = [...this.sessions.values()].filter((e) => e.uid === uid && e.row.status === "active")
      .sort((a, b) => b.last_activity - a.last_activity);
    for (const e of active.slice(3)) this.setStatus(e, "abandoned", "superseded", now.getTime());
    const id = `00000000-0000-4000-8000-${String(this.nextSession++).padStart(12, "0")}`;
    this.sessions.set(id, {
      uid, locked: false, last_activity: now.getTime(),
      row: {
        id, scenario_id: scenarioId, state, turn_count: 0, status: "active", language, max_turns: maxTurns,
        end_reason: null, graded_at: null, score: null, missed_rubric_ids: [],
      },
    });
    return Promise.resolve(id);
  }
  private entry(uid: string, id: string) {
    const e = this.sessions.get(id);
    return e && e.uid === uid ? e : null;
  }
  private own(uid: string, id: string) {
    return this.entry(uid, id)?.row ?? null;
  }
  getSession(uid: string, id: string, now: Date = new Date()) {
    this.expireIdle(uid, now);
    const r = this.own(uid, id);
    return Promise.resolve(r ? structuredClone(r) : null);
  }
  claimChatTurn(uid: string, id: string, now: Date): Promise<ChatTurnClaim> {
    this.expireIdle(uid, now);
    const e = this.entry(uid, id);
    if (!e) return Promise.resolve({ ok: false, reason: "not_found", turn_count: 0, max_turns: 0, status: null });
    const r = e.row;
    if (r.status !== "active" || r.turn_count >= r.max_turns) {
      return Promise.resolve({ ok: false, reason: "ended", turn_count: r.turn_count, max_turns: r.max_turns, status: r.status });
    }
    if (e.locked) return Promise.resolve({ ok: false, reason: "busy", turn_count: r.turn_count, max_turns: r.max_turns, status: r.status });
    r.turn_count++;
    e.last_activity = now.getTime();
    if (r.turn_count >= r.max_turns) this.setStatus(e, "completed", "turn_cap", now.getTime());
    return Promise.resolve({ ok: true, reason: null, turn_count: r.turn_count, max_turns: r.max_turns, status: r.status });
  }
  unclaimChatTurn(uid: string, id: string, claimed: number) {
    const e = this.entry(uid, id);
    if (e && e.row.turn_count === claimed && e.row.graded_at === null &&
        (e.row.status === "active" || (e.row.status === "completed" && e.row.end_reason === "turn_cap"))) {
      if (e.row.status === "completed") this.bumpActivity(uid, e.last_activity, (a) => { a.sessions_completed = Math.max(a.sessions_completed - 1, 0); });
      e.row.turn_count--;
      e.row.status = "active";
      e.row.end_reason = null;
    }
    return Promise.resolve();
  }
  finishSession(uid: string, id: string, now: Date) {
    this.expireIdle(uid, now);
    const e = this.entry(uid, id);
    if (!e) return Promise.resolve(null);
    if (e.row.status === "active") { this.setStatus(e, "completed", "finished", now.getTime()); e.locked = false; }
    return Promise.resolve(e.row.status);
  }
  recordGrade(uid: string, id: string, score: number, items: { id: string; passed: boolean; tags: string[] }[], now: Date) {
    const e = this.entry(uid, id);
    if (!e || e.row.status === "active" || e.row.graded_at !== null) return Promise.resolve(false);
    e.row.graded_at = now.toISOString();
    e.row.score = score;
    e.row.missed_rubric_ids = items.filter((i) => !i.passed).map((i) => i.id);
    for (const it of items) for (const tag of it.tags) this.bumpSkill(uid, tag, it.passed, now.getTime());
    return Promise.resolve(true);
  }
  async claimSessionTurn(uid: string, id: string, expected: number) {
    const e = this.entry(uid, id);
    if (!e || e.row.status !== "active" || e.row.turn_count !== expected || e.row.turn_count >= e.row.max_turns || e.locked) return false;
    e.locked = true;
    await this.onClaim?.();
    return true;
  }
  commitSessionTurn(uid: string, id: string, expected: number, state: unknown, status: "active" | "completed") {
    if (this.failCommit) { this.failCommit = false; return Promise.reject(new Error("db down")); }
    const e = this.entry(uid, id);
    if (!e || e.row.status !== "active" || e.row.turn_count !== expected) return Promise.resolve(false);
    e.row.state = structuredClone(state);
    e.row.turn_count++;
    e.locked = false;
    if (status === "completed" || e.row.turn_count >= e.row.max_turns) {
      this.setStatus(e, "completed", e.row.turn_count >= e.row.max_turns ? "turn_cap" : "scenario", Date.now());
    }
    return Promise.resolve(true);
  }
  releaseSessionTurn(uid: string, id: string) {
    const e = this.entry(uid, id);
    if (e) e.locked = false;
    return Promise.resolve();
  }
  endSession(uid: string, id: string) {
    return this.finishSession(uid, id, new Date());
  }

  // ---- question bank: same contract as the SQL functions (approved only; the key only via questionForAnswer)
  private prog(uid: string, qid: string) { return this.progress.get(`${uid}|${qid}`); }
  private toCandidate(uid: string, q: FakeQuestion): QuestionCandidate {
    const p = this.prog(uid, q.id);
    return {
      id: q.id, scenario_id: q.scenario_id, rubric_item_id: q.rubric_item_id, skill_tag: q.skill_tag, language: q.language,
      type: q.type, stem: q.stem, options: structuredClone(q.options), difficulty: q.difficulty,
      attempts: p?.attempts ?? 0, last_answered_at: p?.last_answered_at ? new Date(p.last_answered_at).toISOString() : null,
      due_at: p ? new Date(p.due_at).toISOString() : null,
    };
  }
  private bumpSkill(uid: string, tag: string, passed: boolean, at: number) {
    const key = `${uid}|${tag}`;
    const k = this.skills.get(key) ?? { attempts: 0, misses: 0, last_missed_at: null };
    k.attempts++;
    if (!passed) { k.misses++; k.last_missed_at = at; }
    this.skills.set(key, k);
  }
  /** End of the user's local day, as an instant (same rule as SQL local_day_end()). */
  localDayEnd(uid: string, now: Date): number {
    const tz = this.tz(uid);
    const today = localDay(now.getTime(), tz);
    // Walk forward in 15-minute steps to the first instant whose local day differs (handles any UTC offset / DST).
    let t = now.getTime();
    while (localDay(t, tz) === today) t += 15 * 60_000;
    // Refine to the minute.
    let lo = t - 15 * 60_000, hi = t;
    while (hi - lo > 60_000) { const mid = lo + Math.floor((hi - lo) / 2); if (localDay(mid, tz) === today) lo = mid; else hi = mid; }
    return hi - (hi % 60_000);
  }
  questionCandidates(uid: string, language: Lang) {
    return Promise.resolve(this.questions.filter((q) => q.status === "approved" && q.language === language && q.type === "mcq")
      .sort((a, b) => (a.id < b.id ? -1 : 1)).map((q) => this.toCandidate(uid, q)));
  }
  questionForAnswer(uid: string, id: string): Promise<QuestionKeyed | null> {
    const q = this.questions.find((x) => x.id === id && x.status === "approved");
    if (!q) return Promise.resolve(null);
    const p = this.prog(uid, q.id);
    return Promise.resolve({
      id: q.id, skill_tag: q.skill_tag, type: q.type, options: structuredClone(q.options),
      correct_option_ids: [...q.correct_option_ids], explanation: q.explanation,
      ease: p?.ease ?? null, interval_days: p?.interval_days ?? null, attempts: p?.attempts ?? 0, correct_streak: p?.correct_streak ?? 0,
    });
  }
  enrollQuestions(uid: string, ids: string[], due: Date) {
    for (const id of ids) {
      if (!this.questions.some((q) => q.id === id && q.status === "approved") || this.prog(uid, id)) continue;
      this.progress.set(`${uid}|${id}`, { ease: 2.5, interval_days: 0, due_at: due.getTime(), attempts: 0, correct_streak: 0, last_answered_at: null });
    }
    return Promise.resolve();
  }
  /** Test hook: the next recordAnswer loses its compare-and-swap race. */
  loseNextAnswerRace = false;
  recordAnswer(uid: string, a: AnswerRecord, now: Date) {
    const key = `${uid}|${a.questionId}`;
    const p = this.progress.get(key);
    if (this.loseNextAnswerRace || (p?.attempts ?? 0) !== a.expectedAttempts) { this.loseNextAnswerRace = false; return Promise.resolve(false); }
    this.progress.set(key, {
      ease: a.ease, interval_days: a.intervalDays, due_at: now.getTime() + a.intervalDays * DAY,
      attempts: (p?.attempts ?? 0) + 1, correct_streak: a.correctStreak, last_answered_at: now.getTime(),
    });
    this.bumpSkill(uid, a.skillTag, a.correct, now.getTime());
    let reviews = 0;
    this.bumpActivity(uid, now.getTime(), (x) => {
      x.questions_answered++;
      if (a.context === "review") x.reviews_answered++;
      reviews = x.reviews_answered;
    });
    if (a.context === "review") {
      const left = this.dueList(uid, now).length;
      if (left === 0 || reviews >= REVIEW_DAILY_CAP) this.bumpActivity(uid, now.getTime(), (x) => { x.review_completed = true; });
    }
    return Promise.resolve(true);
  }
  private dueList(uid: string, now: Date) {
    const end = this.localDayEnd(uid, now);
    return this.questions.filter((q) => q.status === "approved")
      .map((q) => ({ q, p: this.prog(uid, q.id) }))
      .filter((x) => x.p && x.p.due_at < end)
      .sort((a, b) => a.p!.due_at - b.p!.due_at || (a.q.id < b.q.id ? -1 : 1));
  }
  reviewDue(uid: string, now: Date) {
    const today = this.activity.get(`${uid}|${localDay(now.getTime(), this.tz(uid))}`);
    const cap = Math.max(0, REVIEW_DAILY_CAP - (today?.reviews_answered ?? 0));
    return Promise.resolve(this.dueList(uid, now).slice(0, cap).map((x) => this.toCandidate(uid, x.q)));
  }
  reviewDueCount(uid: string, now: Date) { return Promise.resolve(this.dueList(uid, now).length); }
  streak(uid: string, now: Date) {
    const tz = this.tz(uid);
    const counts = (day: string) => {
      const a = this.activity.get(`${uid}|${day}`);
      return !!a && (a.sessions_completed > 0 || a.review_completed);
    };
    const dayOf = (t: number) => localDay(t, tz);
    const todayCounts = counts(dayOf(now.getTime()));
    // Step back one calendar day at a time (noon UTC of the local date avoids DST edge cases).
    const prev = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
    let d = todayCounts ? dayOf(now.getTime()) : prev(dayOf(now.getTime()));
    let n = 0;
    while (counts(d)) { n++; d = prev(d); }
    return Promise.resolve({ current: n, today_counts: todayCounts });
  }
  weakestSkills(uid: string, limit: number): Promise<SkillStat[]> {
    const rows = [...this.skills.entries()].filter(([k, v]) => k.startsWith(`${uid}|`) && v.attempts > 0)
      .map(([k, v]) => ({ skill_tag: k.split("|")[1], ...v }))
      .sort((a, b) => b.misses / b.attempts - a.misses / a.attempts || b.misses - a.misses ||
        (b.last_missed_at ?? 0) - (a.last_missed_at ?? 0) || (a.skill_tag < b.skill_tag ? -1 : 1));
    return Promise.resolve(rows.slice(0, limit).map(({ skill_tag, attempts, misses }) => ({ skill_tag, attempts, misses })));
  }
  reportQuestion(uid: string, questionId: string, reason: string | null) {
    if (!this.questions.some((q) => q.id === questionId && q.status === "approved")) return Promise.resolve(false);
    this.reports.push({ uid, question_id: questionId, reason });
    return Promise.resolve(true);
  }
}
export type LlmMode = "ok" | "retry-then-ok" | "always-500" | "always-429" | "no-usage" | "bad-grade" | "grade-ok" | "reports-cost" | "midstream-error";

/** Fake OpenAI-compatible provider. Records every request (body, path, auth header); never sees a real key. */
export function startFakeLlm(mode: LlmMode) {
  const requests: Record<string, unknown>[] = [];
  const seen: { path: string; auth: string | null }[] = [];
  let calls = 0;
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    calls++;
    seen.push({ path: new URL(req.url).pathname, auth: req.headers.get("authorization") });
    requests.push(await req.json());
    const fail = mode === "always-500" || (mode === "retry-then-ok" && calls === 1);
    if (mode === "always-429") return new Response("UPSTREAM-SECRET-DETAIL", { status: 429, headers: { "retry-after": "0" } });
    if (fail) return new Response("UPSTREAM-SECRET-DETAIL org_abc", { status: 500 });
    const stream = (requests[requests.length - 1] as { stream?: boolean }).stream;
    if (!stream) {
      const content = mode === "bad-grade"
        ? "not json"
        : JSON.stringify({
          items: [{ id: "CA-CPR", passed: true, note: "ok" }, { id: "CA-HELP", passed: false, note: "missed" }, { id: "INVENTED", passed: true, note: "x" }],
          feedback: "Good start.",
        });
      return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 0 } } });
    }
    const enc = new TextEncoder();
    const lines = [
      { choices: [{ delta: { content: '{"next_prompt":' } }] },
      { choices: [{ delta: { content: '"Check breathing"}' } }] },
      ...(mode === "midstream-error" ? [{ error: { message: "UPSTREAM-SECRET-DETAIL", code: 500 } }] : []),
      ...(mode === "no-usage" || mode === "midstream-error" ? [] : [{ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 500 }, ...(mode === "reports-cost" ? { cost: 0.00042 } : {}) } }]),
    ];
    const body = lines.map((l) => `data: ${JSON.stringify(l)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(enc.encode(body), { headers: { "content-type": "text/event-stream" } });
  });
  const addr = server.addr as Deno.NetAddr;
  return {
    url: `http://127.0.0.1:${addr.port}/api/v1`,
    requests,
    seen,
    calls: () => calls,
    stop: () => server.shutdown(),
  };
}

export interface ScriptedReply { status?: number; content?: string | null; usage?: { prompt_tokens: number; completion_tokens: number }; raw?: string }

/**
 * Fake OpenAI-compatible provider driven by a function, for the two-call simulation turn. Always answers with a
 * non-streaming completion. Records every request body so tests can check what the server sent.
 */
export function startScriptedLlm(script: (body: { messages: { role: string; content: string }[]; model: string; [k: string]: unknown }, n: number) => ScriptedReply) {
  const requests: { messages: { role: string; content: string }[]; model: string; [k: string]: unknown }[] = [];
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    const body = await req.json();
    requests.push(body);
    const r = script(body, requests.length);
    if (r.status && r.status !== 200) return new Response("UPSTREAM-SECRET-DETAIL", { status: r.status });
    if (r.raw !== undefined) return new Response(r.raw, { headers: { "content-type": "application/json" } });
    return Response.json({
      choices: [{ message: { content: r.content ?? null } }],
      usage: { ...(r.usage ?? { prompt_tokens: 600, completion_tokens: 40 }), prompt_tokens_details: { cached_tokens: 0 } },
    });
  });
  const addr = server.addr as Deno.NetAddr;
  return { url: `http://127.0.0.1:${addr.port}/api/v1`, requests, stop: () => server.shutdown() };
}

export const isClassifierCall = (b: { messages: { content: string }[] }) => b.messages[0].content.startsWith("You label what a medical trainee DOES");
export const isNarrationCall = (b: { messages: { content: string }[] }) => b.messages[0].content.startsWith("You voice the patient");

export function makeDeps(store: Store, llmUrl: string, over: Partial<Deps> = {}, env: Record<string, string> = {}) {
  const vars: Record<string, string> = { LLM_BASE_URL: llmUrl, LLM_API_KEY: "test-key-not-real", LLM_MODEL_CHAT: "test/chat-model", LLM_MODEL_GRADE: "test/grade-model", ...env };
  const logs: LogEntry[] = [];
  const deps: Deps = {
    store,
    verifyUser: (t) => Promise.resolve(t === "tok-A" ? UID_A : t === "tok-B" ? UID_B : null),
    llm: () => loadLlmConfig((n) => vars[n]),
    allowedOrigins: ["https://bright.example"],
    dailyBudgetUsd: 0.3,
    fetch: (...a) => fetch(...a),
    sleep: () => Promise.resolve(),
    now: () => Date.now(),
    log: (e) => logs.push(e),
    ...over,
  };
  return { deps, logs };
}

export function post(path: string, body: unknown, token: string | null = "tok-A", headers: Record<string, string> = {}) {
  return new Request(`http://localhost/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A controllable server clock: pass `{ now: clock.now }` to makeDeps. */
export function makeClock(start = Date.parse("2026-10-05T03:00:00Z")) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; }, set: (ms: number) => { t = ms; } };
}

export const chatBody = (over: Record<string, unknown> = {}) => ({
  session_id: SESSION_A,
  messages: [{ role: "user", content: "Begin the session. Ask the first question." }],
  ...over,
});

/** Reads the SSE envelope back into deltas + done/error events. */
export async function readSse(res: Response) {
  const text = await res.text();
  const events = [...text.matchAll(/(?:event: (\w+)\n)?data: (.*)\n\n/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]) }));
  return {
    text,
    content: events.map((e) => e.data.delta ?? "").join(""),
    done: events.find((e) => e.data.done)?.data,
    error: events.find((e) => e.event === "error")?.data,
  };
}
