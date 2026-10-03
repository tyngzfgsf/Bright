// The two shipped worked scenarios: they are medically UNREVIEWED, so these tests check that they are coherent,
// clearly marked, inactive by default and dose-free, and that their rules behave as designed. They do not (and cannot)
// certify the medicine.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { applyTurn, initState } from "./engine.ts";
import { RUBRIC_TAGS } from "./rubric.ts";
import { hasDose } from "./safety.ts";
import { type AuthoredScenario, buildRows, buildSql } from "./seedgen.ts";

const dir = new URL("../../../scenarios/", import.meta.url);
const files = [...Deno.readDirSync(dir)].filter((f) => f.name.endsWith(".json")).map((f) => f.name).sort();
const authored: AuthoredScenario[] = files.map((n) => JSON.parse(Deno.readTextFileSync(new URL(n, dir))));

Deno.test("two worked scenarios, each in English and Korean", () => {
  assertEquals(authored.map((a) => a.slug), ["anaphylaxis-sim", "asthma-sim"]);
  assertEquals(authored.flatMap(buildRows).map((r) => `${r.slug}/${r.language}`), [
    "anaphylaxis-sim/en", "anaphylaxis-sim/ko", "asthma-sim/en", "asthma-sim/ko",
  ]);
});

Deno.test("seed_sim.sql is exactly what the generator produces from scenarios/*.json (run scripts/gen-sim-seed.ts)", () => {
  const committed = Deno.readTextFileSync(new URL("../../../seed_sim.sql", import.meta.url));
  assertEquals(committed, buildSql(authored));
});

Deno.test("marked 'needs medical review' everywhere and inactive by default", () => {
  const sql = buildSql(authored);
  assert(sql.includes("NEEDS MEDICAL REVIEW BEFORE RELEASE"));
  assertEquals(sql.match(/::jsonb, false\)/g)?.length, 4); // active = false on every row
  assertFalse(/::jsonb, true\)/.test(sql));
  for (const r of authored.flatMap(buildRows)) {
    assertEquals(r.sim.review.status, "needs_medical_review");
    assert(/needs medical review|의학 검토 필요/i.test(r.title), r.title);
    assert(/NEEDS MEDICAL REVIEW|의학 검토 필요/.test(r.system_prompt + r.sim.review.note), r.slug);
    assert(/not been verified|has NOT been verified/i.test(r.sim.review.note));
  }
});

Deno.test("no dose-shaped phrase anywhere in the shipped content (rubric, opening, persona, outcomes, flags)", () => {
  for (const r of authored.flatMap(buildRows)) {
    const all = [r.title, r.system_prompt, r.sim.opening, r.sim.fallback_reply, r.sim.persona, ...r.rubric.map((i) => i.text),
      ...r.sim.actions.flatMap((a) => [a.description, a.outcome, a.blocked_note]),
      ...r.sim.rules.map((x) => x.narrate), ...Object.values(r.sim.flags)];
    for (const t of all) assertFalse(hasDose(t), `${r.slug}/${r.language}: ${t}`);
  }
});

Deno.test("rubric: same ids and points in both languages, every item tagged from the vocabulary", () => {
  for (const a of authored) {
    const [en, ko] = buildRows(a);
    assertEquals(en.rubric.map((i) => [i.id, i.points, i.tags]), ko.rubric.map((i) => [i.id, i.points, i.tags]));
    for (const item of en.rubric) {
      assert(item.tags.length > 0 && item.tags.every((t) => (RUBRIC_TAGS as readonly string[]).includes(t)), item.id);
      assert(item.text.length > 10 && ko.rubric.find((k) => k.id === item.id)!.text.length > 5);
    }
    const used = new Set(en.rubric.flatMap((i) => i.tags));
    assert(used.size >= 4, `${a.slug} covers ${[...used]}`);
    assert(used.has("medication") && used.has("communication"));
  }
});

Deno.test("the English and Korean rows share the same rules (only the user-visible text differs)", () => {
  for (const a of authored) {
    const [en, ko] = buildRows(a);
    assertEquals({ ...en.sim, opening: "", fallback_reply: "" }, { ...ko.sim, opening: "", fallback_reply: "" });
    assert(en.sim.opening !== ko.sim.opening && /[가-힣]/.test(ko.sim.opening) && !/[가-힣]/.test(en.sim.opening));
  }
});

const play = (name: string, plan: string[][]) => {
  const cfg = buildRows(authored.find((a) => a.slug === name)!)[0].sim;
  let s = initState(cfg);
  let ended = false;
  const states = [s];
  for (const actions of plan) {
    const r = applyTurn(cfg, s, actions);
    s = r.state; ended = r.ended;
    states.push(s);
    if (ended) break;
  }
  return { s, ended, states };
};

Deno.test("anaphylaxis: a good run recovers and completes; a neglected patient collapses", () => {
  const good = play("anaphylaxis-sim", [
    ["recognize_anaphylaxis", "check_airway", "call_for_help"],
    ["give_epinephrine", "remove_trigger"],
    ["give_oxygen", "attach_monitor", "position_patient"],
    ["establish_iv_access"],
    ["give_iv_fluids", "reassure_patient"],
    ["plan_observation"],
  ]);
  assert(good.ended);
  assertEquals(good.s.consciousness, "alert");
  assert(good.s.sbp >= 105 && good.s.spo2 >= 96 && good.s.hr <= 105, JSON.stringify(good.s));

  const neglect = play("anaphylaxis-sim", Array.from({ length: 12 }, () => []));
  assertEquals(neglect.s.consciousness, "unresponsive");
  assert(neglect.s.sbp < 50 && neglect.s.spo2 < 85);
  assertFalse(neglect.ended && neglect.s.turn < 14);
});

Deno.test("anaphylaxis: giving only second-line drugs does NOT rescue the patient (epinephrine is what matters)", () => {
  const wrong = play("anaphylaxis-sim", [["give_second_line_drug"], [], [], [], ["give_second_line_drug"], [], []]);
  assert(wrong.s.sbp < 70, `sbp ${wrong.s.sbp}`);
  assert(wrong.s.flags.includes("deteriorating"));
});

Deno.test("asthma: bronchodilator + oxygen + steroid + escalation completes; neglect deteriorates", () => {
  const good = play("asthma-sim", [
    ["check_airway_breathing", "call_for_help", "attach_monitor"],
    ["give_oxygen", "give_bronchodilator", "sit_upright"],
    ["give_steroid"],
    ["escalate_senior", "reassess_response"],
  ]);
  assert(good.ended);
  assert(good.s.spo2 >= 94 && good.s.rr <= 24, JSON.stringify(good.s));

  const neglect = play("asthma-sim", Array.from({ length: 10 }, () => []));
  assert(neglect.s.spo2 <= 80 && neglect.s.consciousness !== "alert", JSON.stringify(neglect.s));
  assert(neglect.s.flags.includes("deteriorating"));
});

Deno.test("every action is reachable: using it logs it, and its flag effects show up", () => {
  for (const a of authored) {
    const cfg = buildRows(a)[0].sim;
    for (const action of cfg.actions) {
      // Give prerequisites first so a precondition never hides the action.
      const prereq = cfg.actions.filter((x) => x.effects.some((e) => e.type === "set_flag" && action.requires.some((c) => c.type === "flag" && c.flag === e.flag))).map((x) => x.id);
      let s = initState(cfg);
      if (prereq.length) s = applyTurn(cfg, s, prereq).state;
      const r = applyTurn(cfg, s, [action.id]);
      assert(r.applied.includes(action.id), `${a.slug}: ${action.id} could not be applied`);
      assert(r.state.log.at(-1)!.actions.includes(action.id));
    }
  }
});
