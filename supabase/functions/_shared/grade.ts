import { GRADE_MAX_OUTPUT_TOKENS, GRADE_QUOTA_COST, GRADE_TEMPERATURE, MAX_BODY_BYTES } from "./config.ts";
import { costUsd, estimateUsage, extractUsage } from "./cost.ts";
import { errorResponse } from "./errors.ts";
import { groqChat, UpstreamError } from "./groq.ts";
import { finish, guard, reserve } from "./pipeline.ts";
import { buildGradeSystemPrompt, formatTranscript } from "./prompt.ts";
import type { Deps, RubricItem } from "./types.ts";
import { parseGradeBody, ValidationError } from "./validate.ts";

export interface GradeResult {
  score: number;
  items: { id: string; passed: boolean; note: string }[];
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
    items: rubric.map((r) => ({ id: r.id, ...byId.get(r.id)! })),
    feedback: raw.feedback.slice(0, 800),
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
    const scenario = await deps.store.getScenario(input.scenarioId);
    if (!scenario || scenario.language !== input.language || scenario.rubric.length === 0) {
      return finish(deps, "grade", t0, errorResponse("invalid_input", cors), uid, "invalid_input");
    }

    const r = await reserve(ctx, GRADE_QUOTA_COST);
    if ("res" in r) return r.res;
    const quota = r.quota;

    const model = ctx.profile.tier.grade_model;
    const messages = [
      { role: "system", content: buildGradeSystemPrompt(scenario, input.language) },
      { role: "user", content: formatTranscript(input.messages) },
    ];
    const fail = async () => {
      await deps.store.refundQuota(uid, GRADE_QUOTA_COST, quota.day).catch(() => {});
      return finish(deps, "grade", t0, errorResponse("upstream_error", cors), uid, "upstream_error");
    };

    let upstream: Response;
    try {
      upstream = await groqChat(deps, {
        model,
        messages,
        temperature: GRADE_TEMPERATURE,
        max_completion_tokens: GRADE_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        reasoning_effort: ctx.config.reasoningEffort,
        include_reasoning: false,
      });
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      return await fail();
    }

    // deno-lint-ignore no-explicit-any
    let payload: any;
    try { payload = await upstream.json(); } catch { return await fail(); }
    const used = extractUsage(payload) ?? estimateUsage(messages, GRADE_MAX_OUTPUT_TOKENS);
    const cost = costUsd(ctx.config, model, used);
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
    const h = new Headers(cors);
    h.set("content-type", "application/json");
    h.set("cache-control", "no-store");
    return finish(
      deps, "grade", t0,
      new Response(JSON.stringify({ ...result, remaining: quota.remaining, limit: quota.limit }), { status: 200, headers: h }),
      uid, undefined, meta,
    );
  };
}
