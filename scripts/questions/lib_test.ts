// Offline tests for the question generator: recorded/fake LLM responses only, no network, no key.
//   deno test scripts/questions/
import { assert, assertEquals, assertMatch, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  findDuplicate, finalize, generatorMessages, InputError, type Job, type Llm, numbersIn, parseDraft, parseScenarioFile,
  parseVerdict, run, similarity, sourceGuard, sqlString, toSql, validatorMessages,
} from "./lib.ts";

const NOTES_EN = "Give intramuscular epinephrine promptly: adult 0.3-0.5 mg into the anterolateral thigh. " +
  "Antihistamines and steroids are not first-line and must not delay epinephrine. Repeat in 5-15 minutes if no response.";
const NOTES_KO = "에피네프린을 지체 없이 근육주사한다: 성인 0.3-0.5 mg, 대퇴 외측. 항히스타민제와 스테로이드는 1차 치료가 아니며 " +
  "에피네프린 투여를 늦춰서는 안 된다. 반응이 없으면 5-15분 후 반복한다.";

const file = (over: Record<string, unknown> = {}) => ({
  scenarios: [{
    slug: "anaphylaxis",
    en: { title: "Anaphylaxis", reference_notes: NOTES_EN, rubric: [{ id: "AN-EPI", text: "Gives IM epinephrine promptly", tags: ["medication"] }] },
    ko: { title: "아나필락시스", reference_notes: NOTES_KO, rubric: [{ id: "AN-EPI", text: "에피네프린을 근육주사한다", tags: ["medication"] }] },
    ...over,
  }],
});
const [JOB_EN, JOB_KO] = parseScenarioFile(file());

const goodDraft = {
  stem: "An adult has hives, wheeze and low blood pressure after a sting. What should be given first?",
  options: ["Intramuscular epinephrine into the thigh", "An oral antihistamine", "A steroid, then observe", "Wait for the rash to settle"],
  correct_index: 0,
  explanation: "AN-EPI: intramuscular epinephrine is given promptly; antihistamines and steroids must not delay it.",
  difficulty: 2,
};
const PASS = JSON.stringify({ key_consistent: true, exactly_one_correct: true, unsupported_facts: [], pass: true, reason: "ok" });

// ------------------------------------------------------------------ input
Deno.test("input: jobs per rubric item per language; reference_notes are mandatory", () => {
  assertEquals([JOB_EN.lang, JOB_KO.lang, JOB_EN.item.id], ["en", "ko", "AN-EPI"]);
  assertEquals(parseScenarioFile(file(), { lang: "ko" }).length, 1);
  const empty = file();
  (empty.scenarios[0].ko as { reference_notes: string }).reference_notes = "";
  const err = assertThrows(() => parseScenarioFile(empty), InputError);
  assertStringIncludes(err.message, "anaphylaxis/ko");
});

Deno.test("input: bad ids, unknown tags and duplicate slugs are refused", () => {
  const badTag = file();
  badTag.scenarios[0].en.rubric[0].tags = ["cardiology"];
  assertThrows(() => parseScenarioFile(badTag), InputError);
  const badId = file();
  badId.scenarios[0].en.rubric[0].id = "an epi; drop table";
  assertThrows(() => parseScenarioFile(badId), InputError);
  assertThrows(() => parseScenarioFile({ scenarios: [file().scenarios[0], file().scenarios[0]] }), InputError);
  assertThrows(() => parseScenarioFile({}), InputError);
});

Deno.test("the shipped scenarios.json parses and is refused until reference_notes are filled in", async () => {
  const raw = JSON.parse(await Deno.readTextFile(new URL("./scenarios.json", import.meta.url)));
  assertEquals(raw.scenarios.map((s: { slug: string }) => s.slug), ["cardiac-arrest", "anaphylaxis", "stroke"]);
  const filled = structuredClone(raw);
  for (const s of filled.scenarios) for (const l of ["en", "ko"]) s[l].reference_notes = NOTES_EN;
  assertEquals(parseScenarioFile(filled).length, 36); // 3 scenarios x 6 rubric items x 2 languages
  assertThrows(() => parseScenarioFile(raw), InputError);
});

// ------------------------------------------------------------------ prompts
Deno.test("prompts: sources only, one best answer, cite the rubric id; Korean is written natively", () => {
  const en = generatorMessages(JOB_EN);
  assertStringIncludes(en[0].content, "Use ONLY facts stated in SOURCE A and SOURCE B");
  assertStringIncludes(en[0].content, 'cites the rubric item id "AN-EPI"');
  assertStringIncludes(en[1].content, NOTES_EN);
  const ko = generatorMessages(JOB_KO);
  assertStringIncludes(ko[0].content, "번역한 듯한 표현은 쓰지 마세요");
  assertStringIncludes(ko[1].content, NOTES_KO);
  assertEquals(ko[1].content.includes(NOTES_EN), false); // Korean is generated from Korean sources, not from English
  const v = validatorMessages(JOB_EN, goodDraft);
  assertStringIncludes(v[0].content, "exactly_one_correct");
  assertStringIncludes(v[1].content, "MARKED KEY: A");
});

// ------------------------------------------------------------------ schema validation
Deno.test("schema: a well-formed draft passes", () => {
  const r = parseDraft(JSON.stringify(goodDraft));
  assert(r.ok);
});

Deno.test("schema: wrong shapes are rejected with a reason", () => {
  const cases: [unknown, string][] = [
    ["not json", "not JSON"],
    [[], "not an object"],
    [{ ...goodDraft, options: goodDraft.options.slice(0, 3) }, "4 options"],
    [{ ...goodDraft, options: [...goodDraft.options, "E"] }, "4 options"],
    [{ ...goodDraft, correct_index: 4 }, "correct_index"],
    [{ ...goodDraft, correct_index: "0" }, "correct_index"],
    [{ ...goodDraft, difficulty: 5 }, "difficulty"],
    [{ ...goodDraft, stem: "short" }, "stem"],
    [{ ...goodDraft, explanation: "" }, "explanation"],
    [{ ...goodDraft, options: ["Same", "same", "C", "D"] }, "duplicate options"],
    [{ ...goodDraft, options: ["A", "B", "C", "All of the above"] }, "all/none"],
    [{ ...goodDraft, options: ["A", "B", "C", "D\u0000"] }, "option text"],
    [{ ...goodDraft, correct_option: 1 }, "unexpected keys"],
  ];
  for (const [raw, want] of cases) {
    const r = parseDraft(typeof raw === "string" ? raw : JSON.stringify(raw));
    assert(!r.ok, JSON.stringify(raw).slice(0, 60));
    if (!r.ok) assertStringIncludes(r.reason, want);
  }
});

// ------------------------------------------------------------------ deterministic source guard
Deno.test("source guard: numbers must come from the sources; doses cannot be invented", () => {
  const ok = { ...goodDraft, options: ["Epinephrine 0.3-0.5 mg IM", "B", "C", "D"] };
  assert(sourceGuard(JOB_EN, ok).ok);
  const invented = { ...goodDraft, options: ["Epinephrine 1 mg IV", "B", "C", "D"] };
  const r = sourceGuard(JOB_EN, invented);
  assert(!r.ok);
  if (!r.ok) assertStringIncludes(r.reason, "numbers not in sources: 1");
  const repeat = { ...goodDraft, stem: "If there is no response after 20 minutes, what next?" };
  assert(!sourceGuard(JOB_EN, repeat).ok);
});

Deno.test("source guard: the explanation must cite the rubric id; no links", () => {
  assert(!sourceGuard(JOB_EN, { ...goodDraft, explanation: "Epinephrine first because it works." }).ok);
  assert(!sourceGuard(JOB_EN, { ...goodDraft, explanation: "AN-EPI: see https://example.com" }).ok);
});

Deno.test("numbersIn: handles ranges and comma decimals", () => {
  assertEquals(numbersIn("0.3-0.5 mg, 5–15 min, 0,5"), ["0.3", "0.5", "5", "15", "0.5"]);
});

// ------------------------------------------------------------------ validator verdict
Deno.test("validator verdict: every criterion must pass explicitly", () => {
  assert(parseVerdict(PASS).ok);
  const fail = (o: Record<string, unknown>) => parseVerdict(JSON.stringify({ ...JSON.parse(PASS), ...o }));
  assert(!fail({ key_consistent: false }).ok);
  assert(!fail({ exactly_one_correct: false }).ok);
  assert(!fail({ unsupported_facts: ["dose 1 mg"] }).ok);
  assert(!fail({ unsupported_facts: undefined }).ok);
  assert(!fail({ pass: false }).ok);
  assert(!fail({ key_consistent: "true" }).ok); // strings are not booleans
  assert(!parseVerdict("garbage").ok);
  assert(!parseVerdict(null).ok);
});

// ------------------------------------------------------------------ duplicates
Deno.test("duplicates: near-identical stems are caught (English and Korean), different ones are not", () => {
  assert(similarity("What should be given first?", "What should be given first ?") > 0.95);
  assert(findDuplicate("What should be given FIRST for this patient?", ["What should be given first for this patient"]) !== null);
  assert(findDuplicate("가장 먼저 투여해야 할 약은 무엇인가?", ["가장 먼저 투여해야 할 약은 무엇인가"]) !== null);
  assertEquals(findDuplicate("Where is the injection given?", ["What should be given first for this patient?"]), null);
});

// ------------------------------------------------------------------ assembly + pipeline
Deno.test("finalize: options are shuffled, ids a-d, the key follows its option", () => {
  for (const seed of [0.01, 0.4, 0.99]) {
    const q = finalize(JOB_EN, goodDraft, "11111111-1111-4111-8111-111111111111", () => seed);
    assertEquals(q.options.map((o) => o.id), ["a", "b", "c", "d"]);
    assertEquals(q.options.find((o) => o.id === q.correct_option_ids[0])!.text, goodDraft.options[0]);
    assertEquals([q.skill_tag, q.rubric_item_id, q.language], ["medication", "AN-EPI", "en"]);
  }
});

function scripted(responses: (string | Error)[]): Llm {
  let i = 0;
  return (_m) => {
    const r = responses[i++];
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r ?? null);
  };
}
let idn = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idn).padStart(12, "0")}`;

Deno.test("pipeline: accepted when schema, source guard, duplicate check and validator all pass", async () => {
  const r = await run([JOB_EN], { generate: scripted([JSON.stringify(goodDraft)]), validate: scripted([PASS]), newId, rng: () => 0.5 });
  assertEquals(r.accepted.length, 1);
  assertEquals(r.rejected, []);
});

Deno.test("pipeline: a rejected first attempt is retried once, and every rejection is recorded", async () => {
  const bad = JSON.stringify({ ...goodDraft, options: ["Epinephrine 1 mg IV", "B", "C", "D"] });
  const r = await run([JOB_EN], { generate: scripted([bad, JSON.stringify(goodDraft)]), validate: scripted([PASS]), newId, rng: () => 0.5 });
  assertEquals(r.accepted.length, 1);
  assertEquals(r.rejected.length, 1);
  assertStringIncludes(r.rejected[0].reason, "source guard");
});

Deno.test("pipeline: validator says the key is wrong -> rejected (both attempts)", async () => {
  const noKey = JSON.stringify({ key_consistent: false, exactly_one_correct: true, unsupported_facts: [], pass: false, reason: "B is also defensible" });
  const r = await run([JOB_EN], {
    generate: scripted([JSON.stringify(goodDraft), JSON.stringify(goodDraft)]), validate: scripted([noKey, noKey]), newId, rng: () => 0.5,
  });
  assertEquals(r.accepted.length, 0);
  assertEquals(r.rejected.map((x) => x.attempt), [1, 2]);
  assertStringIncludes(r.rejected[0].reason, "validator");
});

Deno.test("pipeline: duplicates of existing or earlier stems are rejected; failed calls are recorded, not thrown", async () => {
  const dup = await run([JOB_EN], {
    generate: scripted([JSON.stringify(goodDraft), JSON.stringify(goodDraft)]), validate: scripted([PASS, PASS]), newId, rng: () => 0.5,
    existingStems: [goodDraft.stem],
  });
  assertEquals(dup.accepted.length, 0);
  assertStringIncludes(dup.rejected[0].reason, "duplicate");
  const down = await run([JOB_EN], { generate: scripted([new Error("HTTP 500"), new Error("HTTP 500")]), validate: scripted([]), newId, rng: () => 0.5 });
  assertEquals(down.rejected.map((x) => x.reason), ["generator call failed: HTTP 500", "generator call failed: HTTP 500"]);
});

// ------------------------------------------------------------------ SQL output
Deno.test("sql: quotes are escaped; everything is inserted as draft; an approval template is commented out", () => {
  assertEquals(sqlString("it's"), "'it''s'");
  const tricky = { ...goodDraft, stem: "Patient's BP drops; what's next? '); drop table questions; --", explanation: "AN-EPI: O'Brien's rule." };
  const q = finalize(JOB_KO, { ...tricky, options: ["에피네프린 근육주사", "항히스타민제", "스테로이드", "관찰"] }, "22222222-2222-4222-8222-222222222222", () => 0.3);
  const sql = toSql([q], "2026-10-05T00:00:00.000Z");
  assertStringIncludes(sql, "'Patient''s BP drops; what''s next? ''); drop table questions; --'");
  assertStringIncludes(sql, "'draft', 'ai'");
  assertEquals(sql.includes("'approved'"), true); // only inside the commented template
  for (const line of sql.split("\n").filter((l) => l.includes("'approved'"))) assertMatch(line, /^--/);
  assertStringIncludes(sql, "에피네프린 근육주사");
  assertStringIncludes(sql, "on conflict (id) do nothing");
});

Deno.test("sql: the committed sample matches what toSql produces (and run-sql-tests.sh loads it into the schema)", async () => {
  const sample = await Deno.readTextFile(new URL("./testdata/sample_draft.sql", import.meta.url));
  assertEquals(toSql(sampleQuestions(), "2026-10-05T00:00:00.000Z"), sample);
});

/** Deterministic sample used for the golden file above. Regenerate with: deno run scripts/questions/lib_test.ts --write-sample */
function sampleQuestions() {
  const jobs = parseScenarioFile({
    scenarios: [{
      slug: "anaphylaxis",
      en: { title: "Anaphylaxis", reference_notes: NOTES_EN, rubric: [{ id: "AN-EPI", text: "Gives IM epinephrine promptly", tags: ["medication"] }] },
      ko: { title: "아나필락시스", reference_notes: NOTES_KO, rubric: [{ id: "AN-EPI", text: "에피네프린을 근육주사한다", tags: ["medication"] }] },
    }],
  }) as Job[];
  return [
    finalize(jobs[0], goodDraft, "5a3b1e00-0000-4000-8000-000000000001", () => 0.7),
    finalize(jobs[1], {
      stem: "벌에 쏘인 뒤 두드러기, 쌕쌕거림, 혈압 저하가 나타난 성인에게 가장 먼저 해야 할 처치는?",
      options: ["대퇴 외측에 에피네프린 근육주사", "경구 항히스타민제 투여", "스테로이드 투여 후 관찰", "발진이 가라앉을 때까지 대기"],
      correct_index: 0,
      explanation: "AN-EPI: 에피네프린 근육주사를 지체 없이 시행하며, 항히스타민제나 스테로이드가 이를 늦춰서는 안 된다.",
      difficulty: 2,
    }, "5a3b1e00-0000-4000-8000-000000000002", () => 0.2),
  ];
}

if (import.meta.main && Deno.args.includes("--write-sample")) {
  await Deno.writeTextFile(new URL("./testdata/sample_draft.sql", import.meta.url), toSql(sampleQuestions(), "2026-10-05T00:00:00.000Z"));
}
