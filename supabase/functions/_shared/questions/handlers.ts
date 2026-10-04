// Debrief questions, answers, the daily review and problem reports.
//
// None of these call the LLM or touch the message quota / global budget (no reserve()): questions come from the
// reviewed bank. They share their own per-minute rate-limit bucket ('questions', see pipeline.ts rateScopeOf).
// Correctness is decided here, against the key, and the key only leaves the server AFTER an answer.
import { MAX_BODY_BYTES, WEAKEST_SKILLS_SHOWN } from "../config.ts";
import { errorResponse, type ErrorCode } from "../errors.ts";
import { type Ctx, finish, guard, jsonOk } from "../pipeline.ts";
import { tagsOf } from "../sim/rubric.ts";
import type { Deps, LogEntry } from "../types.ts";
import { parseAnswerBody, parseEmptyBody, parseGetQuestionsBody, parseReportBody, ValidationError } from "../validate.ts";
import { isCorrect, PRACTICE_LABEL, publicQuestion } from "./public.ts";
import { dueAt, schedule } from "./schedule.ts";
import { selectDebriefQuestions } from "./select.ts";

type Fn = LogEntry["fn"];

type Started<T> =
  | { res: Response }
  | { ctx: Ctx; body: T; fail: (code: ErrorCode, extra?: Record<string, unknown>) => Response };

async function start<T>(req: Request, deps: Deps, fn: Fn, parse: (raw: unknown) => T): Promise<Started<T>> {
  const g = await guard(req, deps, fn, MAX_BODY_BYTES.small);
  if ("res" in g) return { res: g.res };
  const { uid, cors, t0 } = g.ctx;
  const fail = (code: ErrorCode, extra: Record<string, unknown> = {}) =>
    finish(deps, fn, t0, errorResponse(code, cors, extra), uid, code);
  try {
    return { ctx: g.ctx, body: parse(g.ctx.body), fail };
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    return { res: fail("invalid_input") };
  }
}

/** POST /get_questions { session_id } -> 2-4 practice questions for a graded session, without answer keys. */
export function makeGetQuestionsHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const s = await start(req, deps, "get_questions", parseGetQuestionsBody);
    if ("res" in s) return s.res;
    const { ctx: { uid, cors, t0 }, body, fail } = s;
    const now = new Date(deps.now());

    const session = await deps.store.getSession(uid, body.sessionId, now);
    if (!session) return fail("not_found");
    if (session.graded_at === null) return fail("not_graded");

    const scenario = await deps.store.getScenario(session.scenario_id);
    const language = session.language ?? scenario?.language ?? "en";
    const [candidates, weakest] = await Promise.all([
      deps.store.questionCandidates(uid, language),
      deps.store.weakestSkills(uid, WEAKEST_SKILLS_SHOWN),
    ]);
    const picks = selectDebriefQuestions({
      candidates,
      scenarioId: session.scenario_id,
      missedRubricIds: session.missed_rubric_ids,
      weakestTags: weakest.map((w) => w.skill_tag),
      scenarioTags: [...new Set((scenario?.rubric ?? []).flatMap((r) => tagsOf(r)))],
    });

    // Questions for missed rubric items join tomorrow's review even if the user skips the quick check.
    const comesBack = dueAt(now, 1);
    await deps.store.enrollQuestions(uid, picks.filter((p) => p.reason === "missed").map((p) => p.question.id), comesBack);

    return finish(deps, "get_questions", t0, jsonOk(cors, {
      questions: picks.map((p) => ({ ...publicQuestion(p.question), reason: p.reason })),
      skippable: true,
      missed_rubric_ids: session.missed_rubric_ids,
      // When the missed items come back in Review (answering a question reschedules it; see answer_question).
      missed_come_back_at: session.missed_rubric_ids.length > 0 ? comesBack.toISOString() : null,
      label: PRACTICE_LABEL[language],
    }), uid, undefined, { served: picks.length });
  };
}

/** POST /answer_question { question_id, selected_ids, context } -> correctness, the key and explanation, next due. */
export function makeAnswerQuestionHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const s = await start(req, deps, "answer_question", parseAnswerBody);
    if ("res" in s) return s.res;
    const { ctx: { uid, cors, t0 }, body, fail } = s;
    const now = new Date(deps.now());

    const q = await deps.store.questionForAnswer(uid, body.questionId);
    if (!q) return fail("not_found"); // missing, draft and retired questions all look the same
    if (q.type !== "mcq") return fail("invalid_input");
    const optionIds = new Set(q.options.map((o) => o.id));
    if (body.selectedIds.length !== 1 || !body.selectedIds.every((id) => optionIds.has(id))) return fail("invalid_input");

    const correct = isCorrect(body.selectedIds, q.correct_option_ids);
    const next = schedule({ ease: q.ease, intervalDays: q.interval_days, correctStreak: q.correct_streak }, correct);
    const stored = await deps.store.recordAnswer(uid, {
      questionId: q.id,
      skillTag: q.skill_tag,
      correct,
      ease: next.ease,
      intervalDays: next.intervalDays,
      correctStreak: next.correctStreak,
      expectedAttempts: q.attempts,
      context: body.context,
    }, now);
    if (!stored) return fail("answer_conflict"); // a parallel answer to the same question won; nothing written

    return finish(deps, "answer_question", t0, jsonOk(cors, {
      correct,
      correct_option_ids: q.correct_option_ids,
      explanation: q.explanation,
      interval_days: next.intervalDays,
      next_due_at: dueAt(now, next.intervalDays).toISOString(),
    }), uid, undefined, { correct });
  };
}

/** POST /review_queue {} -> today's due questions (cap 10/day), the due count, weakest skills and the streak. */
export function makeReviewQueueHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const s = await start(req, deps, "review_queue", parseEmptyBody);
    if ("res" in s) return s.res;
    const { ctx: { uid, cors, t0 } } = s;
    const now = new Date(deps.now());

    const [due, dueCount, weakest, streak] = await Promise.all([
      deps.store.reviewDue(uid, now),
      deps.store.reviewDueCount(uid, now),
      deps.store.weakestSkills(uid, WEAKEST_SKILLS_SHOWN),
      deps.store.streak(uid, now),
    ]);
    return finish(deps, "review_queue", t0, jsonOk(cors, {
      questions: due.map(publicQuestion),
      // Shown on the Home "Review today" card: what can still be reviewed today (after the daily cap).
      due_today: due.length,
      due_total: dueCount,
      weakest_skills: weakest,
      streak: { current: streak.current, today_counts: streak.today_counts },
    }), uid, undefined, { served: due.length });
  };
}

/** POST /report_question { question_id, reason? } -> 204-like { ok: true }. The reason is stored, never logged. */
export function makeReportQuestionHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const s = await start(req, deps, "report_question", parseReportBody);
    if ("res" in s) return s.res;
    const { ctx: { uid, cors, t0 }, body, fail } = s;
    if (!(await deps.store.reportQuestion(uid, body.questionId, body.reason))) return fail("not_found");
    return finish(deps, "report_question", t0, jsonOk(cors, { ok: true }), uid);
  };
}
