import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { allowedNumbers, buildNarrationPrompt } from "./narrate.ts";
import { initState, applyTurn } from "./engine.ts";
import { checkNarration, hasDose, MAX_REPLY_CHARS } from "./safety.ts";
import { buildRows } from "./seedgen.ts";
import { loadAuthored } from "../testkit.ts";

const cfg = buildRows(loadAuthored("anaphylaxis-sim"))[0].sim;
const turn = applyTurn(cfg, initState(cfg), ["check_airway", "give_oxygen"]);
const allowed = allowedNumbers(cfg, turn.state);

Deno.test("allowed numbers are exactly the state's vitals and elapsed minutes", () => {
  const s = turn.state;
  assertEquals(allowed, new Set([s.hr, s.sbp, s.dbp, s.spo2, s.rr, 1].map(String)));
});

Deno.test("clean in-character replies pass, numbers from the state included", () => {
  const r = checkNarration(`My chest feels tight. The monitor says ${turn.state.hr}, right?`, allowed);
  assert(r.ok);
  assert(checkNarration("I can't breathe properly... my throat is closing.", allowed).ok);
  assert(checkNarration("목이 너무 조여요. 숨쉬기가 힘들어요.", allowed).ok);
});

Deno.test("invented doses are rejected, in English and Korean, digits or words", () => {
  for (const t of ["Give me 0.3 mg of adrenaline", "I need 5 mL", "two milligrams please", "0.3밀리그램 주세요", "10 mcg", "2 units", "an ampoule of epinephrine"]) {
    assertEquals(checkNarration(t, allowed), { ok: false, reason: "dose" }, t);
  }
  assert(hasDose("0.3 mg") && !hasDose("my heart is racing"));
});

Deno.test("numbers that are not in the state are rejected", () => {
  assertEquals(checkNarration("I have had this for 20 minutes and my pressure is 70", allowed), { ok: false, reason: "number" });
  assertEquals(checkNarration(`It started ${turn.state.hr + 1} minutes ago`, allowed), { ok: false, reason: "number" });
});

Deno.test("links, empty text and over-long text are handled", () => {
  assertEquals(checkNarration("see https://evil.example/x", allowed), { ok: false, reason: "link" });
  assertEquals(checkNarration("www.evil.example", allowed), { ok: false, reason: "link" });
  assertEquals(checkNarration("   ", allowed), { ok: false, reason: "empty" });
  const long = checkNarration("a".repeat(5000), allowed);
  assert(long.ok && long.text.length === MAX_REPLY_CHARS);
});

Deno.test("narration prompt forbids inventing treatments, doses and numbers; carries the state and only this turn's events", () => {
  const p = buildNarrationPrompt(cfg, "en", turn.state, turn.events);
  assertStringIncludes(p, "NEVER invent treatments, medications, doses, volumes, test results, procedures, diagnoses or numbers");
  assertStringIncludes(p, "The only numbers you may use are the ones written in CURRENT STATE");
  assertStringIncludes(p, "ONLY if it is listed under EVENTS THIS TURN");
  assertStringIncludes(p, "Never state a dose");
  assertStringIncludes(p, "untrusted");
  assertStringIncludes(p, `Heart rate ${turn.state.hr}, blood pressure ${turn.state.sbp}/${turn.state.dbp}, SpO2 ${turn.state.spo2}`);
  assertStringIncludes(p, "The trainee checks the airway");
  assertStringIncludes(p, "Oxygen is running through a mask");
  assertFalse(p.includes("Epinephrine has been given")); // not done, so not claimed
  assertFalse(p.includes("give_epinephrine")); // rule internals and action ids never reach the narrator
  assertFalse(p.includes("deteriorating") && p.includes("r2"));
  assertStringIncludes(p, "natural, conversational English");
  assertStringIncludes(buildNarrationPrompt(cfg, "ko", turn.state, []), "한국어");
});

Deno.test("narration prompt follows consciousness", () => {
  let s = initState(cfg);
  for (let i = 0; i < 8; i++) s = applyTurn(cfg, s, []).state;
  assertEquals(s.consciousness, "pain");
  assertStringIncludes(buildNarrationPrompt(cfg, "en", s, []), "responds only to pain");
  s = applyTurn(cfg, s, []).state;
  assertEquals(s.consciousness, "unresponsive");
  assertStringIncludes(buildNarrationPrompt(cfg, "en", s, []), "unresponsive: no speech");
});
