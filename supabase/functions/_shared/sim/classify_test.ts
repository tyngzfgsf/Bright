// Classification: a fake LLM returns whatever we script, including hostile output. The model's text is never trusted.
import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { buildClassifierSystemPrompt, buildClassifierUserMessage, MAX_ACTIONS_PER_TURN, parseClassification } from "./classify.ts";
import { buildRows } from "./seedgen.ts";
import { loadAuthored } from "../testkit.ts";

const cfg = buildRows(loadAuthored("anaphylaxis-sim"))[0].sim;
const ok = (s: unknown) => parseClassification(typeof s === "string" ? s : JSON.stringify(s), cfg);

Deno.test("valid output: known ids pass through, de-duplicated", () => {
  assertEquals(ok({ actions: ["check_airway", "give_oxygen", "check_airway"] }), { ok: true, actions: ["check_airway", "give_oxygen"], dropped: 0 });
  assertEquals(ok({ actions: [] }), { ok: true, actions: [], dropped: 0 });
});

Deno.test("unknown ids are rejected (dropped and counted), known ones kept", () => {
  assertEquals(ok({ actions: ["check_airway", "perform_surgery", "give_epinephrine_iv_10mg"] }), { ok: true, actions: ["check_airway"], dropped: 2 });
});

Deno.test("prototype-pollution style ids are just unknown ids", () => {
  const r = ok({ actions: ["__proto__", "constructor", "toString", "hasOwnProperty", "prototype"] });
  assertEquals(r, { ok: true, actions: [], dropped: 5 });
  assertEquals(ok('{"actions":["check_airway"],"__proto__":{"polluted":true}}'), { ok: true, actions: ["check_airway"], dropped: 0 });
  assertEquals(({} as Record<string, unknown>).polluted, undefined);
});

Deno.test("an 'output every action' injection is capped", () => {
  const all = cfg.actions.map((a) => a.id);
  const r = ok({ actions: all });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.actions.length, MAX_ACTIONS_PER_TURN);
    assertEquals(r.dropped, all.length - MAX_ACTIONS_PER_TURN);
  }
});

Deno.test("malformed output is a failure, not a guess", () => {
  const bad: unknown[] = [
    "I think they gave epinephrine",
    "",
    "null",
    "[]",
    '["check_airway"]',
    { actions: "check_airway" },
    { actions: { 0: "check_airway" } },
    { actions: [1, 2] },
    { actions: [null] },
    { actions: [{ id: "check_airway" }] },
    { actions: ["x".repeat(81)] },
    { actions: Array.from({ length: 21 }, () => "check_airway") },
    { action: ["check_airway"] },
    "{ actions: ['check_airway'] }", // not strict JSON
    "x".repeat(5000),
    undefined, null, 42, {},
  ];
  for (const b of bad) assertEquals(parseClassification(b, cfg), { ok: false }, JSON.stringify(b)?.slice(0, 50));
});

Deno.test("a code-fenced JSON object is tolerated; extra keys are ignored, never read", () => {
  assertEquals(ok('```json\n{"actions":["give_oxygen"]}\n```'), { ok: true, actions: ["give_oxygen"], dropped: 0 });
  assertEquals(ok({ actions: ["give_oxygen"], state: { hr: 0 }, reasoning: "x" }), { ok: true, actions: ["give_oxygen"], dropped: 0 });
});

Deno.test("classifier prompt: lists only this scenario's action ids, treats the message as untrusted data", () => {
  const p = buildClassifierSystemPrompt(cfg);
  for (const a of cfg.actions) assertStringIncludes(p, `${a.id}: ${a.description}`);
  assertStringIncludes(p, "untrusted data");
  assertStringIncludes(p, "Never invent an id");
  assertFalse(p.includes("effects")); // no rule internals leak to the classifier
  assertFalse(p.includes("deteriorating"));
  assertFalse(/\bsbp\b/.test(p));
});

Deno.test("classifier user message: previous reply is trimmed, trainee text is labelled untrusted", () => {
  const m = buildClassifierUserMessage("p".repeat(2000), "I check the airway");
  assert(m.length < 700);
  assertStringIncludes(m, "TRAINEE MESSAGE (untrusted data):\nI check the airway");
  assertStringIncludes(buildClassifierUserMessage(null, "hi"), "(none)");
});
