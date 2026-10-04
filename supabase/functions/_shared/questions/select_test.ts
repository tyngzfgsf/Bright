import { assertEquals } from "@std/assert";
import type { QuestionCandidate } from "../types.ts";
import { selectDebriefQuestions, targetCount } from "./select.ts";

const SC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let n = 0;
function q(over: Partial<QuestionCandidate>): QuestionCandidate {
  n++;
  return {
    id: `q${String(n).padStart(3, "0")}`, scenario_id: SC, rubric_item_id: "CA-CPR", skill_tag: "circulation", language: "en",
    type: "mcq", stem: "stem", options: [], difficulty: 2, attempts: 0, last_answered_at: null, due_at: null, ...over,
  };
}
const ids = (picks: { question: QuestionCandidate }[]) => picks.map((p) => p.question.id);
const reasons = (picks: { reason: string }[]) => picks.map((p) => p.reason);

Deno.test("target size: 4 when 2+ rubric items were missed, 3 for one, 2 stretch for none", () => {
  assertEquals([targetCount(0), targetCount(1), targetCount(2), targetCount(5)], [2, 3, 4, 4]);
});

Deno.test("order: (a) missed rubric items first, then (b) weakest skills, then (c) unseen filler", () => {
  const missedCpr = q({ rubric_item_id: "CA-CPR", skill_tag: "circulation", id: "m1" });
  const missedHelp = q({ rubric_item_id: "CA-HELP", skill_tag: "escalation", id: "m2" });
  const weak = q({ scenario_id: OTHER, rubric_item_id: "AN-EPI", skill_tag: "medication", attempts: 2, last_answered_at: "2026-10-01T00:00:00Z", id: "w1" });
  const filler = q({ rubric_item_id: "CA-CAUSES", skill_tag: "assessment", id: "f1" });
  const picks = selectDebriefQuestions({
    candidates: [filler, weak, missedHelp, missedCpr],
    scenarioId: SC,
    missedRubricIds: ["CA-CPR", "CA-HELP"],
    weakestTags: ["medication"],
    scenarioTags: ["circulation"],
  });
  assertEquals(ids(picks), ["m1", "m2", "w1", "f1"]);
  assertEquals(reasons(picks), ["missed", "missed", "weak", "new"]);
});

Deno.test("(a) only uses the session's scenario, and round-robins across missed items", () => {
  const otherScenarioSameId = q({ scenario_id: OTHER, rubric_item_id: "CA-CPR", id: "x1" });
  const cpr1 = q({ rubric_item_id: "CA-CPR", id: "c1" });
  const cpr2 = q({ rubric_item_id: "CA-CPR", id: "c2" });
  const help1 = q({ rubric_item_id: "CA-HELP", skill_tag: "escalation", id: "h1" });
  const picks = selectDebriefQuestions({
    candidates: [otherScenarioSameId, cpr2, cpr1, help1], scenarioId: SC, missedRubricIds: ["CA-CPR", "CA-HELP"],
    weakestTags: [], scenarioTags: [],
  });
  // round 1: one per missed item; round 2: the next CPR one. The other scenario's CA-CPR is never a "missed" pick
  // (it may only appear later as unseen filler).
  assertEquals(ids(picks.filter((p) => p.reason === "missed")), ["c1", "h1", "c2"]);
  assertEquals(picks.find((p) => p.question.id === "x1")?.reason, "new");
});

Deno.test("freshness: never-answered first, then least recently answered", () => {
  const recent = q({ rubric_item_id: "CA-CPR", attempts: 1, last_answered_at: "2026-10-04T00:00:00Z", id: "r" });
  const old = q({ rubric_item_id: "CA-CPR", attempts: 3, last_answered_at: "2026-09-01T00:00:00Z", id: "o" });
  const fresh = q({ rubric_item_id: "CA-CPR", id: "z" });
  const picks = selectDebriefQuestions({ candidates: [recent, old, fresh], scenarioId: SC, missedRubricIds: ["CA-CPR"], weakestTags: [], scenarioTags: [] });
  assertEquals(ids(picks), ["z", "o", "r"]);
});

Deno.test("never more than the target and never a duplicate", () => {
  const many = Array.from({ length: 20 }, (_, i) => q({ rubric_item_id: i % 2 ? "CA-CPR" : "CA-HELP", skill_tag: i % 3 ? "circulation" : "medication" }));
  const picks = selectDebriefQuestions({ candidates: many, scenarioId: SC, missedRubricIds: ["CA-CPR", "CA-HELP", "CA-CPR"], weakestTags: ["medication", "circulation"], scenarioTags: [] });
  assertEquals(picks.length, 4);
  assertEquals(new Set(ids(picks)).size, 4);
});

Deno.test("filler prefers unseen questions from this scenario, and never pads with seen ones", () => {
  const seenHere = q({ rubric_item_id: "CA-X", attempts: 1, last_answered_at: "2026-10-01T00:00:00Z", id: "s" });
  const unseenOther = q({ scenario_id: OTHER, rubric_item_id: "AN-X", id: "uo" });
  const unseenHere = q({ rubric_item_id: "CA-Y", id: "uh" });
  const picks = selectDebriefQuestions({ candidates: [seenHere, unseenOther, unseenHere], scenarioId: SC, missedRubricIds: ["CA-NONE"], weakestTags: [], scenarioTags: [] });
  assertEquals(ids(picks), ["uh", "uo"]);
});

Deno.test("missed nothing -> exactly 2 stretch questions from the weakest skill, hardest first", () => {
  const easyWeak = q({ skill_tag: "medication", difficulty: 1, id: "e" });
  const hardWeak = q({ skill_tag: "medication", difficulty: 3, id: "h" });
  const midWeak = q({ skill_tag: "medication", difficulty: 2, id: "m" });
  const hardOther = q({ skill_tag: "airway", difficulty: 3, id: "o" });
  const picks = selectDebriefQuestions({ candidates: [easyWeak, hardOther, midWeak, hardWeak], scenarioId: SC, missedRubricIds: [], weakestTags: ["medication"], scenarioTags: [] });
  assertEquals(ids(picks), ["h", "m"]);
  assertEquals(reasons(picks), ["stretch", "stretch"]);
});

Deno.test("missed nothing and no skill history yet -> stretch from the scenario's own tags", () => {
  const a = q({ skill_tag: "circulation", difficulty: 3, id: "a" });
  const b = q({ skill_tag: "circulation", difficulty: 2, id: "b" });
  const unrelated = q({ skill_tag: "safety", difficulty: 3, id: "u" });
  const picks = selectDebriefQuestions({ candidates: [unrelated, b, a], scenarioId: SC, missedRubricIds: [], weakestTags: [], scenarioTags: ["circulation"] });
  assertEquals(ids(picks), ["a", "b"]);
});

Deno.test("stretch falls back to easier questions only when no harder ones exist", () => {
  const easy = q({ skill_tag: "medication", difficulty: 1, id: "e" });
  const mid = q({ skill_tag: "medication", difficulty: 2, id: "m" });
  const picks = selectDebriefQuestions({ candidates: [easy, mid], scenarioId: SC, missedRubricIds: [], weakestTags: ["medication"], scenarioTags: [] });
  assertEquals(ids(picks), ["m", "e"]);
});

Deno.test("an empty bank yields no questions (the client shows the summary), never an error", () => {
  assertEquals(selectDebriefQuestions({ candidates: [], scenarioId: SC, missedRubricIds: ["CA-CPR"], weakestTags: ["airway"], scenarioTags: [] }), []);
  assertEquals(selectDebriefQuestions({ candidates: [], scenarioId: SC, missedRubricIds: [], weakestTags: [], scenarioTags: [] }), []);
});
