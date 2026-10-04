import { GRADE_MAX_OUTPUT_TOKENS, GRADE_QUOTA_COST, GRADE_TEMPERATURE, MAX_BODY_BYTES } from "./config.ts";
import { costUsd, estimateUsage, extractUsage, reasoningParam } from "./cost.ts";
import { errorResponse } from "./errors.ts";
import { llmChat, UpstreamError } from "./llm.ts";
import { finish, guard, jsonOk, reserve } from "./pipeline.ts";
import { buildGradeSystemPrompt, formatTranscript } from "./prompt.ts";
import { describeEngineLog, parseState } from "./sim/engine.ts";
import { type RubricTag, tagsOf } from "./sim/rubric.ts";
import { parseSimConfig } from "./sim/simconfig.ts";
import { isGradeable } from "./session.ts";
import type { Deps, RubricItem, SessionRow } from "./types.ts";
import { parseGradeBody, ValidationError } from "./validate.ts";

export interface GradeResult {
  score: number;
  /** `tags` come from the server-side rubric (never from the model) so a skill profile can aggregate by area. */
  items: { id: string; passed: boolean; note: string; tags: RubricTag[] }[];
  feedback: string;
}

/** Validates the model output against the server-side rubric. Score is computed here, not trusted. */
// deno-lint-ignore no-explicit-any
export function validateGrade(raw: any, rubric: RubricItem[]): GradeResult | null {
  if (typeof raw !== "object" || raw === null || !Array.isArray(raw.items) || typeof raw.feedback !== "string") return null;
  const byId = new Map<string, { passed: boolean; note: string }>();
  for (const it of raw.items) {
    if (typeof it?.id !== "string" || typeof it?.passed !== "boolean") return null;
    if (!rubric.some((r) => r.id === it.id)) continue; // ignore invented IDs
    byId.set(it.id, { passed: it.passed, note: typeof it.note === "string" ? it.note.slice(0, 300) : "" });
  }
  if (byId.size !== rubric.length) return null; // every checklist item must be covered
  const total = rubric.reduce((n, r) => n + r.points, 0);
  const earned = rubric.reduce((n, r) => n + (byId.get(r.id)!.passed ? r.points : 0), 0);
  return {
    score: total > 0 ? Math.round((earned / total) * 100) : 0,
    items: rubric.map((r) => ({ id: r.id, ...byId.get(r.id)!, tags: tagsOf(r) })),
    feedback: raw.feedback.slice(0, 800),
  };
}

/** What the client needs about the ended session for the debrief/summary screens. Ids and numbers only. */
function sessionSummary(s: SessionRow) {
  return {
    id: s.id, status: s.status, end_reason: s.end_reason, turn_count: s.turn_count, max_turns: s.max_turns,
    score: s.score, missed_rubric_ids: s.missed_rubric_ids,
  };
}

export function makeGradeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, deps, "grade", MAX_BODY_BYTES.grade);
    if ("res" in g) return g.res;
    const ctx = g.ctx;
    const { uid, cors, t0 } = ctx;

    let input;
    try {
      input = parseGradeBody(ctx.body);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      return finish(deps, "grade", t0, errorResponse("invalid_input", cors), uid, "invalid_input");
    }
    const bad = (code: "invalid_input" | "not_found" | "not_gradeable") =>
      finish(deps, "grade", t0, errorResponse(code, cors), uid, code);

    // Grading always belongs to a session (scenario + language come from it). Ownership is checked against the
    // token's user id; another user's session is indistinguishable from a missing one.
    const now = () => new Date(deps.now());
    let session = await deps.store.getSession(uid, input.sessionId, now());
    if (!session) return bad("not_found");
    const scenario = await deps.store.getScenario(session.scenario_id);
    if (!scenario || scenario.rubric.length === 0 || (input.scenarioId !== null && input.scenarioId !== scenario.id) ||
        (input.language !== null && input.language !== scenario.language)) {
      return bad("invalid_input");
    }
    const language = scenario.language;

    // Already graded: return the stored result (score + pass/fail per rubric item). No LLM call, no quota.
    if (session.graded_at !== null) {
      const missed = new Set(session.missed_rubric_ids);
      return finish(deps, "grade", t0, jsonOk(cors, {
        score: session.score ?? 0,
        items: scenario.rubric.map((r) => ({ id: r.id, passed: !missed.has(r.id), note: "", tags: tagsOf(r) })),
        feedback: null,
        already_graded: true,
        session: sessionSummary(session),
      }), uid);
    }

    // Finish & score: grading an active session ends it first. Then only sessions worth grading are graded.
    if (session.status === "active") {
      await deps.store.finishSession(uid, session.id, now());
      session = await deps.store.getSession(uid, session.id, now());
      if (!session) return bad("not_found");
    }
    if (!isGradeable(session)) {
      return finish(deps, "grade", t0, errorResponse("not_gradeable", cors, { session: sessionSummary(session) }), uid, "not_gradeable");
    }

    // Simulation session: its engine log becomes trusted grading evidence.
    let engineLog: string | undefined;
    if (scenario.sim != null) {
      const cfg = parseSimConfig(scenario.sim);
      const state = cfg ? parseState(session.state, cfg) : null;
      if (!cfg || !state) return bad("invalid_input");
      engineLog = describeEngineLog(cfg, state);
    }

    const r = await reserve(ctx, GRADE_QUOTA_COST);
    if ("res" in r) return r.res;
    const quota = r.quota;

    const model = ctx.profile.tier.grade_model ?? deps.llm().gradeModel;
    const messages = [
      { role: "system", content: buildGradeSystemPrompt(scenario, language, engineLog !== undefined) },
      { role: "user", content: formatTranscript(input.messages, engineLog) },
    ];
    const fail = async () => {
      await deps.store.refundQuota(uid, GRADE_QUOTA_COST, quota.day).catch(() => {});
      return finish(deps, "grade", t0, errorResponse("upstream_error", cors), uid, "upstream_error");
    };

    let upstream: Response;
    try {
      upstream = await llmChat(deps, {
        model,
        messages,
        temperature: GRADE_TEMPERATURE,
        max_tokens: GRADE_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        ...reasoningParam(ctx.config.reasoningEffort),
      });
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      return await fail();
    }

    // deno-lint-ignore no-explicit-any
    let payload: any;
    try { payload = await upstream.json(); } catch { return await fail(); }
    const used = extractUsage(payload) ?? estimateUsage(messages, GRADE_MAX_OUTPUT_TOKENS);
    const cost = costUsd(ctx.config, deps.llm(), model, used);
    await deps.store.recordUsage(uid, used.input, used.output, cost).catch(() => {});

    let result: GradeResult | null = null;
    try {
      result = validateGrade(JSON.parse(payload?.choices?.[0]?.message?.content ?? ""), scenario.rubric);
    } catch { /* invalid JSON */ }
    const meta = { input_tokens: used.input, output_tokens: used.output, cost_usd: cost };
    if (!result) {
      // Tokens were spent, so cost stays recorded; the user's quota is refunded.
      await deps.store.refundQuota(uid, GRADE_QUOTA_COST, quota.day).catch(() => {});
      return finish(deps, "grade", t0, errorResponse("upstream_error", cors), uid, "upstream_error", meta);
    }
    // Store the summary (score + missed rubric ids; never the notes or feedback text) and feed the skill profile.
    // A parallel grade of the same session may have stored first: that one wins, this result is still returned.
    await deps.store.recordGrade(uid, session.id, result.score, result.items.map(({ id, passed, tags }) => ({ id, passed, tags })), now());
    return finish(
      deps, "grade", t0,
      jsonOk(cors, {
        ...result,
        remaining: quota.remaining,
        limit: quota.limit,
        session: sessionSummary({ ...session, score: result.score, missed_rubric_ids: result.items.filter((i) => !i.passed).map((i) => i.id) }),
      }),
      uid, undefined, meta,
    );
  };
}
