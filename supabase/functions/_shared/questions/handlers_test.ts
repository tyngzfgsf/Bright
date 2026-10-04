// get_questions / answer_question / review_queue / report_question against FakeStore (same contract as the SQL).
import { assert, assertEquals, assertFalse } from "@std/assert";
import { type FakeQuestion, FakeStore, makeClock, makeDeps, post, SCENARIO_EN, SCENARIO_KO, startFakeLlm, UID_A, UID_B } from "../testkit.ts";
import { makeAnswerQuestionHandler, makeGetQuestionsHandler, makeReportQuestionHandler, makeReviewQueueHandler } from "./handlers.ts";

const DAY = 86_400_000;
let seq = 0;
function question(over: Partial<FakeQuestion> = {}): FakeQuestion {
  seq++;
  return {
    id: `0000000${seq % 10}-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    scenario_id: SCENARIO_EN, rubric_item_id: "CA-CPR", skill_tag: "circulation", language: "en", type: "mcq",
    stem: "What is the first priority for an unresponsive adult who is not breathing normally?",
    options: [{ id: "a", text: "Start compressions" }, { id: "b", text: "Wait" }, { id: "c", text: "Give water" }, { id: "d", text: "Leave" }],
    correct_option_ids: ["a"],
    explanation: "CA-CPR: start high-quality chest compressions. SECRET-EXPLANATION",
    difficulty: 2, status: "approved",
    ...over,
  };
}

function setup() {
  const llm = startFakeLlm("ok"); // must never be called on this path
  const store = new FakeStore(5);
  const clock = makeClock(Date.parse("2026-10-05T03:00:00Z")); // 12:00 in Seoul
  const { deps, logs } = makeDeps(store, llm.url, { now: clock.now });
  return {
    llm, store, clock, logs,
    get: makeGetQuestionsHandler(deps),
    answer: makeAnswerQuestionHandler(deps),
    review: makeReviewQueueHandler(deps),
    report: makeReportQuestionHandler(deps),
    /** A graded session for user A with the given missed rubric ids. */
    async graded(missed: string[], uid = UID_A) {
      const id = await store.createSession(uid, SCENARIO_EN, {}, "en", 15, new Date(clock.now()));
      const row = store.sessions.get(id)!.row;
      Object.assign(row, { status: "completed", end_reason: "finished", turn_count: 4, graded_at: new Date(clock.now()).toISOString(), score: 50, missed_rubric_ids: missed });
      return id;
    },
  };
}
type Env = ReturnType<typeof setup>;
async function withEnv(fn: (e: Env) => Promise<void>) {
  const e = setup();
  try {
    await fn(e);
    assertEquals(e.llm.calls(), 0, "questions never call the LLM");
    assertEquals(e.store.used.get(UID_A) ?? 0, 0, "questions never use the message quota");
    assertEquals(e.store.usage.length, 0, "questions never record LLM usage/cost");
  } finally {
    await e.llm.stop();
  }
}
const KEY_FIELDS = /correct_option_ids|"explanation"|SECRET-EXPLANATION/;

// ------------------------------------------------------------------ get_questions
Deno.test("get_questions: only approved questions are served, and never the answer key", () =>
  withEnv(async ({ get, store, graded }) => {
    const ok = question({ rubric_item_id: "CA-HELP", skill_tag: "escalation" });
    // draft/retired versions of the same rubric item, plus a draft in another language: must never appear
    store.questions.push(
      question({ rubric_item_id: "CA-HELP", status: "draft" }),
      question({ rubric_item_id: "CA-HELP", status: "retired" }),
      ok,
      question({ rubric_item_id: "CA-CPR", status: "draft" }),
      question({ scenario_id: SCENARIO_KO, language: "ko", rubric_item_id: "CA-HELP" }),
    );
    const session_id = await graded(["CA-HELP", "CA-CPR"]);
    const res = await get(post("get_questions", { session_id }));
    assertEquals(res.status, 200);
    const text = await res.text();
    assertFalse(KEY_FIELDS.test(text), "no key or explanation before answering");
    const body = JSON.parse(text);
    assertEquals(body.questions.map((q: { id: string }) => q.id), [ok.id]);
    assertEquals(body.questions[0].label, "Practice question. Check official guidelines.");
    assertEquals(Object.keys(body.questions[0]).sort(), ["difficulty", "id", "label", "language", "options", "reason", "rubric_item_id", "skill_tag", "stem", "type"]);
    assertEquals(body.skippable, true);
  }));

Deno.test("get_questions: order is missed items, then weakest skills, then unseen filler; 4 when 2+ missed", () =>
  withEnv(async ({ get, store, graded }) => {
    const missedHelp = question({ rubric_item_id: "CA-HELP", skill_tag: "escalation" });
    const missedCpr = question({ rubric_item_id: "CA-CPR", skill_tag: "circulation" });
    const weak = question({ scenario_id: "99999999-0000-4000-8000-000000000001", rubric_item_id: "AN-EPI", skill_tag: "medication" });
    const filler = question({ rubric_item_id: "CA-CAUSES", skill_tag: "assessment" });
    store.questions.push(filler, weak, missedCpr, missedHelp);
    store.skills.set(`${UID_A}|medication`, { attempts: 4, misses: 3, last_missed_at: 1 });
    store.skills.set(`${UID_A}|airway`, { attempts: 4, misses: 0, last_missed_at: null });
    const session_id = await graded(["CA-HELP", "CA-CPR"]);
    const body = await (await get(post("get_questions", { session_id }))).json();
    assertEquals(body.questions.map((q: { id: string }) => q.id), [missedHelp.id, missedCpr.id, weak.id, filler.id]);
    assertEquals(body.questions.map((q: { reason: string }) => q.reason), ["missed", "missed", "weak", "new"]);
  }));

Deno.test("get_questions: missed questions are enrolled for tomorrow's review even if skipped", () =>
  withEnv(async ({ get, review, store, graded, clock }) => {
    const missed = question({ rubric_item_id: "CA-HELP" });
    const filler = question({ rubric_item_id: "CA-CAUSES" });
    store.questions.push(missed, filler);
    const session_id = await graded(["CA-HELP"]);
    const body = await (await get(post("get_questions", { session_id }))).json();
    assertEquals(body.missed_come_back_at, new Date(clock.now() + DAY).toISOString());
    assert(store.progress.has(`${UID_A}|${missed.id}`));
    assertFalse(store.progress.has(`${UID_A}|${filler.id}`)); // filler only enters review once answered
    assertEquals((await (await review(post("review_queue", {}))).json()).due_total, 0); // not due today
    clock.advance(DAY);
    const tomorrow = await (await review(post("review_queue", {}))).json();
    assertEquals(tomorrow.questions.map((q: { id: string }) => q.id), [missed.id]);
  }));

Deno.test("get_questions: missed nothing -> 2 stretch questions", () =>
  withEnv(async ({ get, store, graded }) => {
    store.questions.push(
      question({ skill_tag: "circulation", difficulty: 3 }), question({ skill_tag: "circulation", difficulty: 2 }),
      question({ skill_tag: "circulation", difficulty: 1 }),
    );
    const body = await (await get(post("get_questions", { session_id: await graded([]) }))).json();
    assertEquals(body.questions.length, 2);
    assertEquals(body.questions.map((q: { reason: string }) => q.reason), ["stretch", "stretch"]);
    assertEquals(body.missed_come_back_at, null);
  }));

Deno.test("get_questions: an ungraded session -> 409 not_graded; another user's -> 404; bad id -> 400", () =>
  withEnv(async ({ get, store, graded, clock }) => {
    const active = await store.createSession(UID_A, SCENARIO_EN, {}, "en", 15, new Date(clock.now()));
    const r = await get(post("get_questions", { session_id: active }));
    assertEquals([r.status, (await r.json()).error], [409, "not_graded"]);
    assertEquals((await get(post("get_questions", { session_id: await graded(["CA-CPR"]) }, "tok-B"))).status, 404);
    assertEquals((await get(post("get_questions", { session_id: "nope" }))).status, 400);
  }));

// ------------------------------------------------------------------ answer_question
Deno.test("answer_question: correctness is decided server-side; the key and explanation come back only now", () =>
  withEnv(async ({ answer, store, clock }) => {
    const q = question();
    store.questions.push(q);
    const right = await (await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"] }))).json();
    assertEquals(right.correct, true);
    assertEquals(right.correct_option_ids, ["a"]);
    assert(right.explanation.includes("CA-CPR"));
    assertEquals(right.interval_days, 1);
    assertEquals(right.next_due_at, new Date(clock.now() + DAY).toISOString());

    const wrong = await (await answer(post("answer_question", { question_id: q.id, selected_ids: ["b"] }))).json();
    assertEquals([wrong.correct, wrong.interval_days], [false, 1]);
    const p = store.progress.get(`${UID_A}|${q.id}`)!;
    assertEquals([p.attempts, p.correct_streak, p.ease], [2, 0, 2.4]); // 2.5 +0.1 -0.2
    assertEquals(store.skills.get(`${UID_A}|circulation`), { attempts: 2, misses: 1, last_missed_at: clock.now() });
  }));

Deno.test("answer_question: the client cannot claim correctness or pick an invalid option", () =>
  withEnv(async ({ answer, store }) => {
    const q = question();
    store.questions.push(q);
    for (const body of [
      { question_id: q.id, selected_ids: ["b"], correct: true },
      { question_id: q.id, selected_ids: ["b"], score: 100 },
      { question_id: q.id, selected_ids: ["z"] }, // not an option
      { question_id: q.id, selected_ids: ["a", "b"] }, // mcq has exactly one answer
      { question_id: q.id, selected_ids: [] },
      { question_id: q.id, selected_ids: ["a", "a"] },
      { question_id: q.id, selected_ids: ["A;drop"] },
      { question_id: q.id, selected_ids: ["a"], context: "exam" },
      { question_id: q.id, selected_ids: ["a"], user_id: UID_B },
    ]) {
      assertEquals((await answer(post("answer_question", body))).status, 400, JSON.stringify(body));
    }
    assertEquals(store.progress.size, 0);
  }));

Deno.test("answer_question: draft, retired and unknown questions are 404 (the key never leaks)", () =>
  withEnv(async ({ answer, store }) => {
    const draft = question({ status: "draft" });
    const retired = question({ status: "retired" });
    store.questions.push(draft, retired);
    for (const id of [draft.id, retired.id, "99999999-9999-4999-8999-999999999999"]) {
      const res = await answer(post("answer_question", { question_id: id, selected_ids: ["a"] }));
      assertEquals(res.status, 404);
      assertFalse(KEY_FIELDS.test(await res.text()));
    }
  }));

Deno.test("answer_question: a lost race writes nothing and returns 409 answer_conflict", () =>
  withEnv(async ({ answer, store }) => {
    const q = question();
    store.questions.push(q);
    store.loseNextAnswerRace = true;
    const res = await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"] }));
    assertEquals([res.status, (await res.json()).error], [409, "answer_conflict"]);
    assertEquals(store.progress.size, 0);
  }));

Deno.test("question functions use their own rate-limit bucket, not the LLM one", () =>
  withEnv(async ({ answer, review, store }) => {
    const q = question();
    store.questions.push(q);
    store.config = { ...store.config, rateLimitPerMinute: 1000, questionsRateLimitPerMinute: 3 };
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = i % 2 ? await review(post("review_queue", {})) : await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"] }));
      codes.push(r.status);
      await r.text();
    }
    assertEquals(codes, [200, 200, 200, 429, 429]);
    assert(store.rateChecks.every((c) => c.scope === "questions" && c.max === 3));
  }));

Deno.test("logs on the question path are metadata only (no stems, options, reasons)", () =>
  withEnv(async ({ answer, report, store, logs }) => {
    const q = question();
    store.questions.push(q);
    await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"] }));
    await report(post("report_question", { question_id: q.id, reason: "SECRET-REASON wrong key" }));
    const dump = JSON.stringify(logs);
    for (const s of ["SECRET-REASON", "compressions", q.stem]) assertFalse(dump.includes(s));
  }));

// ------------------------------------------------------------------ review_queue + streak
Deno.test("review_queue: due today only, oldest first, capped at 10 a day (cap shrinks as reviews are answered)", () =>
  withEnv(async ({ review, answer, store, clock }) => {
    const qs = Array.from({ length: 13 }, () => question());
    store.questions.push(...qs, question({ status: "retired" }));
    // 12 due today (one of them retired-in-bank below is excluded by status), 1 due next week
    qs.forEach((q, i) => store.progress.set(`${UID_A}|${q.id}`, {
      ease: 2.5, interval_days: 1, due_at: clock.now() - (i < 12 ? (12 - i) * 60_000 : -7 * DAY), attempts: 1, correct_streak: 0, last_answered_at: clock.now() - DAY,
    }));
    const first = await (await review(post("review_queue", {}))).json();
    assertEquals(first.due_total, 12);
    assertEquals(first.due_today, 10);
    assertEquals(first.questions.map((q: { id: string }) => q.id), qs.slice(0, 10).map((q) => q.id));
    assertFalse(KEY_FIELDS.test(JSON.stringify(first)));

    for (const q of qs.slice(0, 4)) await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"], context: "review" }));
    const after = await (await review(post("review_queue", {}))).json();
    assertEquals(after.due_today, 6); // 10 - 4 answered today
    assertEquals(after.due_total, 8);
  }));

Deno.test("review_queue: weakest skills and the streak; completing today's review counts the day", () =>
  withEnv(async ({ review, answer, store, clock }) => {
    const q = question();
    store.questions.push(q);
    store.progress.set(`${UID_A}|${q.id}`, { ease: 2.5, interval_days: 1, due_at: clock.now() - 60_000, attempts: 1, correct_streak: 0, last_answered_at: clock.now() - DAY });
    store.skills.set(`${UID_A}|airway`, { attempts: 10, misses: 1, last_missed_at: 1 });
    store.skills.set(`${UID_A}|medication`, { attempts: 4, misses: 3, last_missed_at: 2 });
    store.skills.set(`${UID_B}|safety`, { attempts: 9, misses: 9, last_missed_at: 3 }); // another user's: never shown
    // yesterday (Seoul) a session was completed
    store.activity.set(`${UID_A}|2026-10-04`, { sessions_completed: 1, questions_answered: 0, reviews_answered: 0, review_completed: false });

    const before = await (await review(post("review_queue", {}))).json();
    assertEquals(before.weakest_skills, [{ skill_tag: "medication", attempts: 4, misses: 3 }, { skill_tag: "airway", attempts: 10, misses: 1 }]);
    assertEquals(before.streak, { current: 1, today_counts: false }); // alive until the local day ends

    await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"], context: "review" }));
    const after = await (await review(post("review_queue", {}))).json();
    assertEquals(after.due_today, 0);
    assertEquals(after.streak, { current: 2, today_counts: true });
  }));

Deno.test("debrief answers do not complete the review or count the day by themselves", () =>
  withEnv(async ({ review, answer, store }) => {
    const q = question();
    store.questions.push(q);
    await answer(post("answer_question", { question_id: q.id, selected_ids: ["a"] })); // context defaults to debrief
    const r = await (await review(post("review_queue", {}))).json();
    assertEquals(r.streak, { current: 0, today_counts: false });
    const day = [...store.activity.values()][0];
    assertEquals([day.questions_answered, day.reviews_answered, day.review_completed], [1, 0, false]);
  }));

Deno.test("review_queue: an unknown body key is rejected", () =>
  withEnv(async ({ review }) => {
    assertEquals((await review(post("review_queue", { cap: 1000 }))).status, 400);
  }));

// ------------------------------------------------------------------ report_question
Deno.test("report_question: stores a trimmed optional reason; only approved questions; length capped", () =>
  withEnv(async ({ report, store }) => {
    const q = question();
    const draft = question({ status: "draft" });
    store.questions.push(q, draft);
    assertEquals(await (await report(post("report_question", { question_id: q.id, reason: "  The key looks wrong  " }))).json(), { ok: true });
    assertEquals((await report(post("report_question", { question_id: q.id }))).status, 200);
    assertEquals(store.reports, [
      { uid: UID_A, question_id: q.id, reason: "The key looks wrong" },
      { uid: UID_A, question_id: q.id, reason: null },
    ]);
    assertEquals((await report(post("report_question", { question_id: draft.id }))).status, 404);
    assertEquals((await report(post("report_question", { question_id: q.id, reason: "x".repeat(281) }))).status, 400);
    assertEquals((await report(post("report_question", { question_id: q.id, reason: 42 }))).status, 400);
  }));
