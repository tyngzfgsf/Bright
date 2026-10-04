import { loadLlmConfig } from "./llm-config.ts";
import { type AuthoredScenario, buildRows } from "./sim/seedgen.ts";
import type { AppConfig, Deps, LogEntry, Profile, Quota, Scenario, SessionRow, Store } from "./types.ts";

export const UID_A = "11111111-1111-4111-8111-111111111111";
export const UID_B = "22222222-2222-4222-8222-222222222222";
export const SCENARIO_EN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SCENARIO_KO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
  return { id, slug: r.slug, language: lang, title: r.title, system_prompt: r.system_prompt, rubric: r.rubric, sim: r.sim };
};

export const scenarios: Scenario[] = [
  {
    id: SCENARIO_EN, slug: "cardiac-arrest", language: "en", title: "Cardiac arrest",
    sim: null,
    system_prompt: "An adult collapsed in a public place.",
    rubric: [
      { id: "CA-CPR", text: "Starts compressions", points: 3 },
      { id: "CA-HELP", text: "Calls for help", points: 1 },
    ],
  },
  { id: SCENARIO_KO, slug: "cardiac-arrest", language: "ko", title: "심정지", system_prompt: "쓰러진 성인", rubric: [{ id: "CA-CPR", text: "가슴압박", points: 1 }], sim: null },
  simScenario(SIM_EN, "en"),
  simScenario(SIM_KO, "ko"),
  // A sim column that fails validation must behave like "not a simulation scenario", never crash.
  { ...simScenario(SIM_BROKEN, "en"), slug: "broken-sim", sim: { version: 1, nonsense: true } },
];

export class FakeStore implements Store {
  profiles = new Map<string, Profile>();
  used = new Map<string, number>();
  hits = new Map<string, number>();
  globalCost = 0;
  usage: { uid: string; input: number; output: number; cost: number }[] = [];
  refunds = 0;
  sessions = new Map<string, { uid: string; row: SessionRow; locked: boolean }>();
  private nextSession = 1;
  /** Test hook: make commitSessionTurn throw once (simulates a database failure after the LLM calls). */
  failCommit = false;
  /** Test hook: runs inside claimSessionTurn right after the claim succeeds (to race a second request). */
  onClaim: (() => Promise<void>) | null = null;
  config: AppConfig = {
    prices: {
      "test/chat-model": { input: 0.1, cached_input: 0.05, output: 0.4 },
      "test/grade-model": { input: 0.2, cached_input: 0.1, output: 0.8 },
    },
    rateLimitPerMinute: 1000,
    reasoningEffort: "low",
  };
  constructor(limit = 15) {
    for (const uid of [UID_A, UID_B]) {
      this.profiles.set(uid, {
        age_confirmed: true,
        tier: { name: "free", daily_message_limit: limit, chat_model: null, grade_model: null, max_output_tokens: 321 },
      });
    }
  }
  getProfile(uid: string) { return Promise.resolve(this.profiles.get(uid) ?? null); }
  getScenario(id: string) { return Promise.resolve(scenarios.find((s) => s.id === id) ?? null); }
  getConfig() { return Promise.resolve(this.config); }
  checkRateLimit(uid: string, max: number) {
    const n = (this.hits.get(uid) ?? 0) + 1;
    this.hits.set(uid, n);
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
  // Same contract as the SQL functions: every call is scoped to uid; a foreign session is simply "not found".
  createSession(uid: string, scenarioId: string, state: unknown) {
    const id = `00000000-0000-4000-8000-${String(this.nextSession++).padStart(12, "0")}`;
    this.sessions.set(id, { uid, locked: false, row: { id, scenario_id: scenarioId, state, turn_count: 0, status: "active" } });
    return Promise.resolve(id);
  }
  private entry(uid: string, id: string) {
    const e = this.sessions.get(id);
    return e && e.uid === uid ? e : null;
  }
  private own(uid: string, id: string) {
    return this.entry(uid, id)?.row ?? null;
  }
  getSession(uid: string, id: string) {
    const r = this.own(uid, id);
    return Promise.resolve(r ? structuredClone(r) : null);
  }
  async claimSessionTurn(uid: string, id: string, expected: number) {
    const e = this.entry(uid, id);
    if (!e || e.row.status !== "active" || e.row.turn_count !== expected || e.locked) return false;
    e.locked = true;
    await this.onClaim?.();
    return true;
  }
  commitSessionTurn(uid: string, id: string, expected: number, state: unknown, status: "active" | "completed") {
    if (this.failCommit) { this.failCommit = false; return Promise.reject(new Error("db down")); }
    const e = this.entry(uid, id);
    if (!e || e.row.status !== "active" || e.row.turn_count !== expected) return Promise.resolve(false);
    e.row.state = structuredClone(state);
    e.row.status = status;
    e.row.turn_count++;
    e.locked = false;
    return Promise.resolve(true);
  }
  releaseSessionTurn(uid: string, id: string) {
    const e = this.entry(uid, id);
    if (e) e.locked = false;
    return Promise.resolve();
  }
  endSession(uid: string, id: string) {
    const r = this.own(uid, id);
    if (!r) return Promise.resolve(null);
    if (r.status === "active") r.status = "completed";
    return Promise.resolve(r.status);
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

export const chatBody = (over: Record<string, unknown> = {}) => ({
  scenario_id: SCENARIO_EN,
  language: "en",
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
