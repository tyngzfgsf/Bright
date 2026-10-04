// Rules-engine unit tests. Pure functions only: no network, no clock, no LLM.
import { assert, assertEquals, assertFalse, assertNotEquals } from "@std/assert";
import { buildRows } from "./seedgen.ts";
import { loadAuthored } from "../testkit.ts";
import { applyTurn, describeEngineLog, initState, parseState, publicState } from "./engine.ts";
import { parseSimConfigOrThrow } from "./simconfig.ts";
import { CONSCIOUSNESS, VITAL_BOUNDS, VITALS, type PatientState, type SimConfig } from "./types.ts";

const row = (name: string, lang: "en" | "ko" = "en") => buildRows(loadAuthored(name)).find((r) => r.language === lang)!.sim;
const ana = row("anaphylaxis-sim");

function play(cfg: SimConfig, plan: string[][]): PatientState {
  let s = initState(cfg);
  for (const actions of plan) s = applyTurn(cfg, s, actions).state;
  return s;
}
const idle = (n: number) => Array.from({ length: n }, () => [] as string[]);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

Deno.test("initial state comes from the config; the public view hides flags, log and rule bookkeeping", () => {
  const s = initState(ana);
  assertEquals([s.hr, s.sbp, s.dbp, s.spo2, s.rr, s.consciousness], [118, 98, 60, 93, 24, "alert"]);
  assertEquals([s.turn, s.clock_s, s.log.length], [0, 0, 0]);
  assertEquals(Object.keys(publicState(s)).sort(), ["clock_s", "consciousness", "dbp", "hr", "rr", "sbp", "spo2", "turn"]);
});

Deno.test("pure: same input, same output; the input state is never mutated", () => {
  const frozen = deepFreeze(initState(ana));
  const a = applyTurn(ana, frozen, ["check_airway", "give_oxygen"]);
  const b = applyTurn(ana, frozen, ["check_airway", "give_oxygen"]);
  assertEquals(a, b);
  assertEquals(frozen.turn, 0);
  assertEquals(frozen.log.length, 0);
  assertNotEquals(a.state, frozen);
});

Deno.test("action order is canonical (config order), never the order the LLM listed them in", () => {
  const s0 = initState(ana);
  const a = applyTurn(ana, s0, ["give_iv_fluids", "establish_iv_access", "check_airway"]);
  const b = applyTurn(ana, s0, ["check_airway", "establish_iv_access", "give_iv_fluids"]);
  assertEquals(a, b);
  // IV access comes before fluids in the scenario, so asking for fluids "first" still works in one turn.
  assertEquals(a.applied, ["check_airway", "establish_iv_access", "give_iv_fluids"]);
});

Deno.test("unknown / hostile ids reaching the engine are ignored (second line of defence)", () => {
  const r = applyTurn(ana, initState(ana), ["__proto__", "constructor", "toString", "nope", "give_epinephrine; drop table"]);
  assertEquals(r.applied, []);
  assertEquals(r.events.filter((e) => e.kind !== "rule").length, 0);
  assertEquals(Object.keys(r.state.done), []);
  assertEquals(({} as Record<string, unknown>).polluted, undefined);
});

Deno.test("rule: epinephrine not given by turn 4 -> blood pressure drops", () => {
  const t3 = play(ana, idle(3));
  const t4 = play(ana, idle(4));
  assertEquals(t3.sbp, 90); // 98 - 4 - 4 (early-worsening rule on turns 2 and 3)
  assertEquals(t4.sbp, 82); // turn 4: the "no epinephrine yet" rule drops it by 8
  assert(t4.sbp < t3.sbp && t4.hr > t3.hr);
  assert(t4.flags.includes("deteriorating"));
});

Deno.test("rule stops applying once epinephrine is given, and the patient recovers instead", () => {
  const neglect = play(ana, idle(6));
  const treated = play(ana, [["give_epinephrine", "give_oxygen"], ...idle(5)]);
  assert(treated.sbp > neglect.sbp + 40, `treated ${treated.sbp} vs neglect ${neglect.sbp}`);
  assert(treated.spo2 >= 96 && neglect.spo2 < 90);
  assertEquals(treated.consciousness, "alert");
  assertFalse(treated.flags.includes("deteriorating"));
});

Deno.test("late epinephrine still helps (rule: done, not 'done by turn N')", () => {
  const s = play(ana, [...idle(4), ["give_epinephrine", "give_oxygen"], ...idle(3)]);
  assert(s.sbp > 100, `sbp ${s.sbp}`);
});

Deno.test("action effects set flags and the engine log records which actions happened on which turn", () => {
  const s = play(ana, [[], ["check_airway"], ["call_for_help", "give_oxygen"], ["check_airway"]]);
  assert(s.flags.includes("airway_assessed") && s.flags.includes("help_called") && s.flags.includes("oxygen_on"));
  assertEquals(s.log.map((e) => [e.turn, e.actions]), [[1, []], [2, ["check_airway"]], [3, ["call_for_help", "give_oxygen"]], [4, []]]);
  assertEquals(s.done["check_airway"], { first: 2, last: 2, n: 1 }); // the repeat on turn 4 changed nothing
});

Deno.test("a precondition blocks an action; it is logged as blocked, not done, and works once the prerequisite exists", () => {
  const t1 = applyTurn(ana, initState(ana), ["give_iv_fluids"]);
  assertEquals(t1.applied, []);
  assertEquals(t1.state.log[0].blocked, ["give_iv_fluids"]);
  assertFalse("give_iv_fluids" in t1.state.done);
  assert(t1.events.some((e) => e.kind === "blocked" && /no IV access/i.test(e.text)));
  const t2 = applyTurn(ana, t1.state, ["establish_iv_access"]).state;
  const t3 = applyTurn(ana, t2, ["give_iv_fluids"]);
  assertEquals(t3.applied, ["give_iv_fluids"]);
});

Deno.test("one-off actions ignore repeats; repeatable ones re-apply their effects", () => {
  const o1 = play(ana, [["give_oxygen"]]);
  const o2 = play(ana, [["give_oxygen"], ["give_oxygen"]]);
  assertEquals(o2.done["give_oxygen"].n, 1);
  assertEquals(o2.log[1].actions, []);
  assertEquals(o1.done["give_oxygen"].n, 1);
  const e = play(ana, [["give_epinephrine"], ["give_epinephrine"]]);
  assertEquals(e.done["give_epinephrine"], { first: 1, last: 2, n: 2 });
});

Deno.test("`once` rules fire exactly once and their narration appears once", () => {
  let s = initState(ana);
  const narrations: string[] = [];
  for (let i = 0; i < 9; i++) {
    const r = applyTurn(ana, s, []);
    s = r.state;
    narrations.push(...r.events.filter((e) => e.id === "r5").map((e) => e.text));
  }
  assertEquals(narrations.length, 1);
  assertEquals(s.fired.filter((f) => f === "r5").length, 1);
});

Deno.test("untreated patient deteriorates in order: verbal, pain, then unresponsive; vitals stay in bounds", () => {
  const seen: string[] = [];
  let s = initState(ana);
  for (let i = 0; i < 14; i++) {
    s = applyTurn(ana, s, []).state;
    if (seen.at(-1) !== s.consciousness) seen.push(s.consciousness);
    for (const v of VITALS) assert(s[v] >= VITAL_BOUNDS[v][0] && s[v] <= VITAL_BOUNDS[v][1]);
  }
  assertEquals(seen, ["alert", "verbal", "pain", "unresponsive"]);
  assert(s.sbp > 0, "the floor condition keeps the blood pressure from running to zero");
});

Deno.test("time: base seconds per turn plus action extra seconds", () => {
  const s = play(ana, [["establish_iv_access"], []]);
  assertEquals(s.clock_s, 60 + 60 + 60);
});

Deno.test("termination: an `end` rule completes the case; max_turns is a hard stop", () => {
  const done = applyTurn(ana, play(ana, [["give_epinephrine"]]), ["plan_observation"]);
  assert(done.ended);
  assertFalse(applyTurn(ana, initState(ana), ["plan_observation"]).ended); // observation without treatment does not end it
  let s = initState(ana);
  let ended = false;
  for (let i = 0; i < ana.max_turns; i++) {
    const r = applyTurn(ana, s, []);
    s = r.state;
    ended = r.ended;
    if (i < ana.max_turns - 1) assertFalse(ended);
  }
  assert(ended);
});

const tiny = parseSimConfigOrThrow({
  version: 1,
  review: { status: "needs_medical_review", note: "test" },
  turn_seconds: 10, max_turns: 5, opening: "o", fallback_reply: "f", persona: "p",
  initial: { hr: 100, sbp: 100, dbp: 60, spo2: 96, rr: 16, consciousness: "alert", flags: [] },
  flags: {},
  actions: [
    { id: "boost", description: "d", outcome: "o", repeatable: true, effects: [{ type: "add", vital: "spo2", amount: 200 }, { type: "add", vital: "sbp", amount: -200 }, { type: "add", vital: "hr", amount: 200 }] },
    { id: "nudge", description: "d", outcome: "o", repeatable: true, effects: [{ type: "toward", vital: "spo2", target: 97, step: 5 }] },
  ],
  rules: [],
});

Deno.test("vitals are clamped to physiological bounds whatever the effects say", () => {
  const s = applyTurn(tiny, initState(tiny), ["boost"]).state;
  assertEquals([s.spo2, s.sbp, s.hr], [100, 0, 250]);
});

Deno.test("`toward` never overshoots its target", () => {
  const s = applyTurn(tiny, initState(tiny), ["nudge"]).state; // 96 -> 97 although step is 5
  assertEquals(s.spo2, 97);
  assertEquals(applyTurn(tiny, s, ["nudge"]).state.spo2, 97);
});

Deno.test("parseState: a stored state round-trips; corrupt or foreign state is rejected", () => {
  const s = play(ana, [["check_airway", "give_oxygen"], [], []]);
  assertEquals(parseState(JSON.parse(JSON.stringify(s)), ana), s);
  const bad: ((x: Record<string, unknown>) => void)[] = [
    (x) => { x.v = 2; },
    (x) => { x.sbp = -1; },
    (x) => { x.spo2 = 101; },
    (x) => { x.hr = 1.5; },
    (x) => { x.hr = "118"; },
    (x) => { x.consciousness = "dead"; },
    (x) => { x.flags = ["not_a_flag"]; },
    (x) => { x.fired = ["r999"]; },
    (x) => { x.done = { not_an_action: { first: 1, last: 1, n: 1 } }; },
    (x) => { x.log = Array.from({ length: 201 }, () => ({ turn: 1, clock_s: 1, actions: [], blocked: [] })); },
    (x) => { x.log = [{ turn: 1, clock_s: 1, actions: ["nope"], blocked: [] }]; },
    (x) => { x.turn = -1; },
  ];
  for (const mutate of bad) {
    const x = JSON.parse(JSON.stringify(s));
    mutate(x);
    assertEquals(parseState(x, ana), null);
  }
  assertEquals(parseState(null, ana), null);
  assertEquals(parseState([], ana), null);
  assertEquals(parseState("x", ana), null);
});

Deno.test("describeEngineLog lists what was done, when, what never happened, and the final state", () => {
  const s = play(ana, [["check_airway"], ["give_iv_fluids"], ["give_epinephrine"]]);
  const text = describeEngineLog(ana, s);
  assert(/turn 1 @ 1:00: check_airway/.test(text));
  assert(/turn 2 @ 2:00: \(nothing\) \| attempted but not possible yet: give_iv_fluids/.test(text));
  assert(/turn 3 @ 3:00: give_epinephrine/.test(text));
  assert(/Actions never performed: .*give_oxygen/.test(text));
  assert(/Final patient state: HR \d+, BP \d+\/\d+/.test(text));
});

// -------- seeded fuzz over both shipped scenarios: invariants hold for ANY sequence of classifier outputs
function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
for (const name of ["anaphylaxis-sim", "asthma-sim"]) {
  Deno.test(`fuzz ${name}: bounds, determinism, valid stored state, one log entry per turn`, () => {
    const cfg = row(name);
    const ids = cfg.actions.map((a) => a.id).concat(["bogus", "__proto__"]);
    const rand = prng(12345);
    for (let run = 0; run < 150; run++) {
      const plan = Array.from({ length: 1 + Math.floor(rand() * cfg.max_turns) }, () =>
        ids.filter(() => rand() < 0.2));
      let a = initState(cfg);
      let b = initState(cfg);
      for (const actions of plan) {
        a = applyTurn(cfg, a, actions).state;
        b = applyTurn(cfg, b, [...actions].reverse()).state; // input order must not matter
        for (const v of VITALS) {
          assert(Number.isInteger(a[v]) && a[v] >= VITAL_BOUNDS[v][0] && a[v] <= VITAL_BOUNDS[v][1]);
        }
        assert((CONSCIOUSNESS as readonly string[]).includes(a.consciousness));
        assert(parseState(JSON.parse(JSON.stringify(a)), cfg) !== null);
      }
      assertEquals(a, b);
      assertEquals(a.log.length, plan.length);
      assertEquals(a.turn, plan.length);
    }
  });
}
