import { assert, assertEquals, assertThrows } from "@std/assert";
import { loadAuthored } from "../testkit.ts";
import { parseSimConfig, parseSimConfigOrThrow, SimConfigError } from "./simconfig.ts";

const base = () => ({
  version: 1,
  review: { status: "needs_medical_review", note: "test" },
  turn_seconds: 60, max_turns: 10, opening: "o", fallback_reply: "f", persona: "p",
  initial: { hr: 100, sbp: 100, dbp: 60, spo2: 96, rr: 16, consciousness: "alert", flags: [] as string[] },
  flags: { f1: "a flag" } as Record<string, string>,
  actions: [{ id: "a1", description: "does a thing", outcome: "the thing was done", effects: [] as unknown[], requires: [] as unknown[], blocked_note: "" }] as Record<string, unknown>[],
  rules: [] as Record<string, unknown>[],
});
// deno-lint-ignore no-explicit-any
const mutate = (fn: (c: any) => void) => { const c = base(); fn(c); return c; };
/** The config must be rejected with a SimConfigError whose message matches `why` (so it fails for the right reason). */
function rejects(c: unknown, why: RegExp) {
  const e = assertThrows(() => parseSimConfigOrThrow(c), SimConfigError);
  assert(why.test(e.message), `"${e.message}" does not match ${why}`);
}

Deno.test("a minimal valid config parses; defaults are filled in", () => {
  const c = parseSimConfigOrThrow(base());
  assertEquals(c.actions[0].repeatable, false);
  assertEquals(c.actions[0].extra_seconds, 0);
  assertEquals(c.rules, []);
});

Deno.test("both shipped scenarios (both languages) validate", () => {
  for (const name of ["anaphylaxis-sim", "asthma-sim"]) {
    const a = loadAuthored(name);
    for (const lang of ["en", "ko"] as const) {
      const c = parseSimConfig({ ...a.shared, opening: a.i18n[lang].opening, fallback_reply: a.i18n[lang].fallback_reply });
      assert(c !== null, `${name}/${lang}`);
      assertEquals(c!.review.status, "needs_medical_review");
    }
  }
});

Deno.test("production wrapper: a broken config is 'not a simulation scenario', never an exception", () => {
  for (const bad of [null, undefined, 1, "x", [], {}, { version: 2 }, mutate((c) => { c.rules = [{ id: "r", when: [], effects: [{ type: "boom" }] }]; })]) {
    assertEquals(parseSimConfig(bad), null);
  }
});

Deno.test("unknown keys are rejected everywhere (a typo must not silently change behaviour)", () => {
  rejects(mutate((c) => { c.extra = 1; }), /unknown key/);
  rejects(mutate((c) => { c.actions[0].efects = []; }), /unknown key/);
  rejects(mutate((c) => { c.initial.mood = "x"; }), /unknown key/);
  rejects(mutate((c) => { c.rules = [{ id: "r1", when: [], effects: [], typo: 1 }]; }), /unknown key/);
});

Deno.test("references must resolve: undeclared flags, unknown actions, unknown vitals", () => {
  rejects(mutate((c) => { c.initial.flags = ["ghost"]; }), /undeclared flag/);
  rejects(mutate((c) => { c.actions[0].effects = [{ type: "set_flag", flag: "ghost" }]; }), /undeclared flag/);
  rejects(mutate((c) => { c.rules = [{ id: "r1", when: [{ type: "done", action: "ghost" }], effects: [] }]; }), /unknown action/);
  rejects(mutate((c) => { c.actions[0].effects = [{ type: "add", vital: "temperature", amount: 1 }]; }), /vital/);
});

Deno.test("ids: pattern enforced, duplicates and prototype-ish names rejected", () => {
  rejects(mutate((c) => { c.actions[0].id = "__proto__"; }), /id must match/);
  rejects(mutate((c) => { c.actions[0].id = "Bad Id"; }), /id must match/);
  rejects(mutate((c) => { c.actions.push({ ...c.actions[0] }); }), /duplicate/);
  rejects(mutate((c) => { c.rules = [{ id: "r1", when: [], effects: [] }, { id: "r1", when: [], effects: [] }]; }), /duplicate/);
});

Deno.test("numeric limits: vitals within bounds, steps and amounts bounded, clocks sane", () => {
  rejects(mutate((c) => { c.initial.spo2 = 101; }), /spo2/);
  rejects(mutate((c) => { c.initial.hr = 99.5; }), /integer/);
  rejects(mutate((c) => { c.turn_seconds = 0; }), /turn_seconds/);
  rejects(mutate((c) => { c.max_turns = 1000; }), /max_turns/);
  rejects(mutate((c) => { c.actions[0].effects = [{ type: "add", vital: "hr", amount: 9999 }]; }), /amount/);
  rejects(mutate((c) => { c.actions[0].effects = [{ type: "toward", vital: "spo2", target: 98, step: 0 }]; }), /step/);
});

Deno.test("doses can never be authored into a scenario (LLM-facing text is linted)", () => {
  for (const text of ["Give 0.3 mg now", "a 5 mL bolus", "2 units of insulin", "half a milligram", "0.3밀리그램", "500 cc", "10 mcg"]) {
    rejects(mutate((c) => { c.actions[0].outcome = text; }), /dose|numbers/);
    rejects(mutate((c) => { c.persona = text; }), /dose/);
    rejects(mutate((c) => { c.opening = text; }), /dose/);
  }
});

Deno.test("outcome / narration hints / flag descriptions contain no numbers at all", () => {
  rejects(mutate((c) => { c.actions[0].outcome = "BP is now 90"; }), /numbers/);
  rejects(mutate((c) => { c.rules = [{ id: "r1", when: [], effects: [], narrate: "after 3 minutes" }]; }), /numbers/);
  rejects(mutate((c) => { c.flags.f1 = "level 2"; }), /numbers/);
  rejects(mutate((c) => { c.actions[0].requires = [{ type: "flag", flag: "f1" }]; c.actions[0].blocked_note = ""; }), /blocked_note/); // a blocked action must say why
});

Deno.test("size limits: too many actions / effects are rejected", () => {
  rejects(mutate((c) => { c.actions = Array.from({ length: 41 }, (_, i) => ({ id: `a${i}`, description: "d", outcome: "o" })); }), /at most 40/);
  rejects(mutate((c) => { c.actions[0].effects = Array.from({ length: 11 }, () => ({ type: "end" })); }), /at most 10/);
});
