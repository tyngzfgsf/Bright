// Bounded sessions: start_session, chat inside a session (409 session_ended, turn cap, inactivity), grade gating.
import { assert, assertEquals } from "@std/assert";
import { makeChatHandler } from "./chat.ts";
import { makeGradeHandler } from "./grade.ts";
import { makeStartSessionHandler } from "./start_session.ts";
import {
  FakeStore, makeClock, makeDeps, post, readSse, SCENARIO_EN, SCENARIO_KO, SCENARIO_SHORT, SIM_EN, startFakeLlm,
  UID_A, UID_B,
} from "./testkit.ts";

const MIN = 60_000;
const msg = (content = "I check responsiveness") => [{ role: "user", content }];

function setup(mode: Parameters<typeof startFakeLlm>[0] = "ok", limit = 50) {
  const llm = startFakeLlm(mode);
  const store = new FakeStore(limit);
  const clock = makeClock();
  const { deps, logs } = makeDeps(store, llm.url, { now: clock.now });
  return {
    llm, store, clock, logs,
    start: makeStartSessionHandler(deps),
    chat: makeChatHandler(deps),
    grade: makeGradeHandler(deps),
    async open(scenario = SCENARIO_EN, language = "en", token = "tok-A") {
      const res = await makeStartSessionHandler(deps)(post("start_session", { scenario_id: scenario, language }, token));
      assertEquals(res.status, 200);
      return await res.json() as { session_id: string; max_turns: number; status: string; mode: string };
    },
  };
}
type Env = ReturnType<typeof setup>;
async function withEnv(fn: (e: Env) => Promise<void>, mode: Parameters<typeof startFakeLlm>[0] = "ok", limit = 50) {
  const e = setup(mode, limit);
  try { await fn(e); } finally { await e.llm.stop(); }
}

// ------------------------------------------------------------------ start_session
Deno.test("start_session: creates an active session with the scenario's cap; no LLM call, no quota", () =>
  withEnv(async ({ open, store, llm }) => {
    const s = await open();
    assertEquals([s.status, s.max_turns, s.mode], ["active", 15, "chat"]);
    const row = store.sessions.get(s.session_id)!;
    assertEquals([row.uid, row.row.scenario_id, row.row.language, row.row.turn_count], [UID_A, SCENARIO_EN, "en", 0]);
    assertEquals(llm.calls(), 0);
    assertEquals(store.used.get(UID_A) ?? 0, 0);
  }));

Deno.test("start_session: per-scenario cap and sim scenarios (their engine's max_turns)", () =>
  withEnv(async ({ open }) => {
    assertEquals((await open(SCENARIO_SHORT)).max_turns, 3);
    const sim = await open(SIM_EN);
    assertEquals([sim.mode, sim.max_turns], ["sim", 14]);
  }));

Deno.test("start_session: language mismatch, unknown scenario, unknown keys -> 400; no token -> 401", () =>
  withEnv(async ({ start, store }) => {
    for (const body of [
      { scenario_id: SCENARIO_KO, language: "en" },
      { scenario_id: "99999999-9999-4999-8999-999999999999", language: "en" },
      { scenario_id: SCENARIO_EN, language: "en", max_turns: 1000 }, // the client never sets the cap
      { scenario_id: SCENARIO_EN },
    ]) {
      assertEquals((await start(post("start_session", body))).status, 400, JSON.stringify(body));
    }
    assertEquals((await start(post("start_session", { scenario_id: SCENARIO_EN, language: "en" }, null))).status, 401);
    assertEquals(store.sessions.size, 2); // only the two pre-created ones
  }));

// ------------------------------------------------------------------ chat requires a live session
Deno.test("chat: no session_id -> 400; it is no longer possible to chat without a session", () =>
  withEnv(async ({ chat, llm, store }) => {
    const res = await chat(post("chat", { scenario_id: SCENARIO_EN, language: "en", messages: msg() }));
    assertEquals(res.status, 400);
    assertEquals(llm.calls(), 0);
    assertEquals(store.used.get(UID_A) ?? 0, 0);
  }));

Deno.test("chat: another user's session is 404 (indistinguishable from missing); nothing spent", () =>
  withEnv(async ({ chat, open, llm, store }) => {
    const { session_id } = await open();
    const res = await chat(post("chat", { session_id, messages: msg() }, "tok-B"));
    assertEquals(res.status, 404);
    assertEquals((await res.json()).error, "not_found");
    assertEquals(llm.calls(), 0);
    assertEquals(store.used.get(UID_B) ?? 0, 0);
    assertEquals(store.sessions.get(session_id)!.row.turn_count, 0);
  }));

Deno.test("chat: a simulation session cannot be driven through /chat (the engine owns its state)", () =>
  withEnv(async ({ chat, open, llm }) => {
    const { session_id } = await open(SIM_EN);
    assertEquals((await chat(post("chat", { session_id, messages: msg() }))).status, 400);
    assertEquals(llm.calls(), 0);
  }));

Deno.test("chat: the done event reports turn progress for the counter", () =>
  withEnv(async ({ chat, open }) => {
    const { session_id } = await open();
    const out = await readSse(await chat(post("chat", { session_id, messages: msg() })));
    assertEquals([out.done.turn_count, out.done.max_turns, out.done.status], [1, 15, "active"]);
  }));

Deno.test("turn cap: the last allowed turn completes the session; the next message is 409 session_ended", () =>
  withEnv(async ({ chat, open, store, llm }) => {
    const { session_id } = await open(SCENARIO_SHORT); // cap 3
    const statuses: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await chat(post("chat", { session_id, messages: msg(`turn ${i}`) }));
      assertEquals(res.status, 200);
      statuses.push((await readSse(res)).done.status);
    }
    assertEquals(statuses, ["active", "active", "completed"]);
    const row = store.sessions.get(session_id)!.row;
    assertEquals([row.status, row.end_reason, row.turn_count], ["completed", "turn_cap", 3]);

    const over = await chat(post("chat", { session_id, messages: msg("one more") }));
    assertEquals(over.status, 409);
    assertEquals(await over.json(), { error: "session_ended", status: "completed", end_reason: "turn_cap" });
    assertEquals(llm.calls(), 3);
    assertEquals(store.used.get(UID_A), 3); // the refused message cost nothing
  }));

Deno.test("turn cap holds under parallel requests: exactly max_turns get through", () =>
  withEnv(async ({ chat, open, store }) => {
    const { session_id } = await open(SCENARIO_SHORT);
    const results = await Promise.all(Array.from({ length: 10 }, () => chat(post("chat", { session_id, messages: msg() }))));
    const codes = results.map((r) => r.status);
    await Promise.all(results.map((r) => r.text()));
    assertEquals(codes.filter((c) => c === 200).length, 3);
    assertEquals(codes.filter((c) => c === 409).length, 7);
    assertEquals(store.sessions.get(session_id)!.row.turn_count, 3);
    assertEquals(store.used.get(UID_A), 3);
  }));

Deno.test("Finish & score ends the session: further messages are 409, with no quota and no LLM call", () =>
  withEnv(async ({ chat, grade, open, store, llm }) => {
    const { session_id } = await open();
    await readSse(await chat(post("chat", { session_id, messages: msg() })));
    await grade(post("grade", { session_id, messages: msg() })).then((r) => r.text());
    const calls = llm.calls();
    const used = store.used.get(UID_A);
    const res = await chat(post("chat", { session_id, messages: msg("still there?") }));
    assertEquals(res.status, 409);
    assertEquals((await res.json()).end_reason, "finished");
    assertEquals(llm.calls(), calls);
    assertEquals(store.used.get(UID_A), used);
  }, "grade-ok"));

Deno.test("inactivity: 30 minutes idle -> abandoned; the next message is 409 with end_reason inactive", () =>
  withEnv(async ({ chat, open, clock, store, llm }) => {
    const { session_id } = await open();
    await readSse(await chat(post("chat", { session_id, messages: msg() })));
    clock.advance(29 * MIN); // activity resets the timer...
    assertEquals((await chat(post("chat", { session_id, messages: msg() }))).status, 200);
    clock.advance(30 * MIN + 1);
    const res = await chat(post("chat", { session_id, messages: msg() }));
    assertEquals(res.status, 409);
    assertEquals(await res.json(), { error: "session_ended", status: "abandoned", end_reason: "inactive" });
    assertEquals(store.sessions.get(session_id)!.row.status, "abandoned");
    assertEquals(llm.calls(), 2);
  }));

Deno.test("an upstream failure gives the turn back (and the quota)", () =>
  withEnv(async ({ chat, open, store }) => {
    const { session_id } = await open(SCENARIO_SHORT);
    const res = await chat(post("chat", { session_id, messages: msg() }));
    assertEquals(res.status, 502);
    await res.text();
    assertEquals(store.sessions.get(session_id)!.row.turn_count, 0);
    assertEquals(store.sessions.get(session_id)!.row.status, "active");
    assertEquals(store.used.get(UID_A) ?? 0, 0);
  }, "always-500"));

Deno.test("echoed scenario_id / language must match the session", () =>
  withEnv(async ({ chat, open, llm }) => {
    const { session_id } = await open();
    for (const extra of [{ scenario_id: SCENARIO_KO }, { language: "ko" }]) {
      assertEquals((await chat(post("chat", { session_id, messages: msg(), ...extra }))).status, 400);
    }
    assertEquals((await chat(post("chat", { session_id, messages: msg(), scenario_id: SCENARIO_EN, language: "en" }))).status, 200);
    assertEquals(llm.calls(), 1);
  }));

// ------------------------------------------------------------------ grade
Deno.test("grade: finishes an active session, grades it once, stores ids/score only, feeds skill stats", () =>
  withEnv(async ({ chat, grade, open, store, llm }) => {
    const { session_id } = await open();
    await readSse(await chat(post("chat", { session_id, messages: msg() })));
    const res = await grade(post("grade", { session_id, messages: [{ role: "user", content: "I start compressions" }, { role: "assistant", content: "ok" }] }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.score, 75);
    assertEquals(body.session.end_reason, "finished");
    assertEquals(body.session.missed_rubric_ids, ["CA-HELP"]);
    const row = store.sessions.get(session_id)!.row;
    assertEquals([row.status, row.score, row.missed_rubric_ids], ["completed", 75, ["CA-HELP"]]);
    assert(row.graded_at !== null);
    // rubric tags -> skill_stats (CA-CPR passed: circulation; CA-HELP missed: escalation + communication)
    assertEquals(store.skills.get(`${UID_A}|circulation`), { attempts: 1, misses: 0, last_missed_at: null });
    assertEquals(store.skills.get(`${UID_A}|escalation`)!.misses, 1);
    // the session counts toward today's streak
    assertEquals([...store.activity.values()].reduce((n, a) => n + a.sessions_completed, 0), 1);

    // grading again: stored result, no LLM call, no quota
    const calls = llm.calls();
    const used = store.used.get(UID_A);
    const again = await (await grade(post("grade", { session_id, messages: msg() }))).json();
    assertEquals([again.score, again.already_graded, again.feedback], [75, true, null]);
    assertEquals(again.items.map((i: { passed: boolean }) => i.passed), [true, false]);
    assertEquals(llm.calls(), calls);
    assertEquals(store.used.get(UID_A), used);
    assertEquals(store.skills.get(`${UID_A}|circulation`)!.attempts, 1); // not double-counted
  }, "grade-ok"));

Deno.test("grade: an abandoned session is gradeable only with 3+ turns; a finished one needs 1+", () =>
  withEnv(async ({ chat, grade, open, clock, llm }) => {
    // 2 turns, then timed out -> 409 not_gradeable, nothing spent
    const short = await open();
    for (let i = 0; i < 2; i++) await readSse(await chat(post("chat", { session_id: short.session_id, messages: msg() })));
    clock.advance(31 * MIN);
    const r1 = await grade(post("grade", { session_id: short.session_id, messages: msg() }));
    assertEquals(r1.status, 409);
    const b1 = await r1.json();
    assertEquals([b1.error, b1.session.status, b1.session.end_reason], ["not_gradeable", "abandoned", "inactive"]);

    // 3 turns, then timed out -> graded
    const enough = await open();
    for (let i = 0; i < 3; i++) await readSse(await chat(post("chat", { session_id: enough.session_id, messages: msg() })));
    clock.advance(31 * MIN);
    assertEquals((await grade(post("grade", { session_id: enough.session_id, messages: msg() }))).status, 200);

    // Finish & score with zero turns -> finished but not graded (no LLM call for an empty transcript)
    const empty = await open();
    const calls = llm.calls();
    const r3 = await grade(post("grade", { session_id: empty.session_id, messages: msg() }));
    assertEquals(r3.status, 409);
    assertEquals((await r3.json()).session.status, "completed");
    assertEquals(llm.calls(), calls);
  }, "grade-ok"));

Deno.test("grade: needs a session; another user's session is 404", () =>
  withEnv(async ({ grade, open, llm }) => {
    assertEquals((await grade(post("grade", { scenario_id: SCENARIO_EN, language: "en", messages: msg() }))).status, 400);
    const { session_id } = await open();
    assertEquals((await grade(post("grade", { session_id, messages: msg() }, "tok-B"))).status, 404);
    assertEquals(llm.calls(), 0);
  }, "grade-ok"));
