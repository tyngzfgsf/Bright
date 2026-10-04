// POST /functions/v1/sim   { action: "start" | "turn" | "end", ... }
//
// A turn, in order (the state change is CODE; the LLM only labels the input and voices the output):
//   1. classify  small LLM call: trainee message -> known action ids (strict JSON, unknown ids rejected)
//   2. engine    pure rules engine applies the actions + rules to the hidden state (sim/engine.ts)
//   3. narrate   LLM voices the patient from the NEW state; reply is filtered for doses/invented numbers
// The state is committed only after all three succeed. Any failure refunds the user's quota and leaves the
// state untouched. To the user the whole turn is ONE message; cost tracking records BOTH LLM calls.
import { MAX_BODY_BYTES } from "../config.ts";
import { costUsd, estimateUsage, extractUsage, reasoningParam } from "../cost.ts";
import { errorResponse, type ErrorCode } from "../errors.ts";
import { llmChat, UpstreamError } from "../llm.ts";
import { finish, guard, reserve, type Ctx } from "../pipeline.ts";
import type { Deps, LogEntry, Msg, Quota } from "../types.ts";
import { parseSimBody, ValidationError } from "../validate.ts";
import {
  buildClassifierSystemPrompt, buildClassifierUserMessage, CLASSIFY_MAX_OUTPUT_TOKENS, CLASSIFY_TEMPERATURE, parseClassification,
} from "./classify.ts";
import { applyTurn, initState, parseState, publicState } from "./engine.ts";
import { allowedNumbers, buildNarrationPrompt, NARRATE_TEMPERATURE } from "./narrate.ts";
import { checkNarration } from "./safety.ts";
import { parseSimConfig } from "./simconfig.ts";

function json(cors: Headers, body: unknown): Response {
  const h = new Headers(cors);
  h.set("content-type", "application/json");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status: 200, headers: h });
}

interface Meter { input: number; output: number; cost: number; calls: number }

/** One non-streaming chat call. Usage and cost are recorded (per call) as soon as the call returns, whatever happens next. */
async function runLlm(
  ctx: Ctx,
  meter: Meter,
  req: { model: string; messages: Msg[] | { role: string; content: string }[]; temperature: number; maxTokens: number; json: boolean },
): Promise<string | null> {
  const { deps, uid } = ctx;
  const res = await llmChat(deps, {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    ...(req.json ? { response_format: { type: "json_object" } } : {}),
    ...reasoningParam(ctx.config.reasoningEffort),
  });
  // deno-lint-ignore no-explicit-any
  let payload: any;
  try { payload = await res.json(); } catch { throw new UpstreamError("bad body"); }
  const used = extractUsage(payload) ?? estimateUsage(req.messages, req.maxTokens);
  const cost = costUsd(ctx.config, deps.llm(), req.model, used);
  meter.input += used.input;
  meter.output += used.output;
  meter.cost += cost;
  meter.calls++;
  await deps.store.recordUsage(uid, used.input, used.output, cost).catch(() => {});
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

export function makeSimHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, deps, "sim", MAX_BODY_BYTES.chat);
    if ("res" in g) return g.res;
    const ctx = g.ctx;
    const { uid, cors, t0 } = ctx;
    const fin = (code: ErrorCode, extra: Partial<LogEntry> = {}) =>
      finish(deps, "sim", t0, errorResponse(code, cors), uid, code, extra);

    let body;
    try {
      body = parseSimBody(ctx.body);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      return fin("invalid_input");
    }

    if (body.action === "start") {
      const scenario = await deps.store.getScenario(body.scenarioId);
      const cfg = scenario && scenario.language === body.language ? parseSimConfig(scenario.sim) : null;
      if (!scenario || !cfg) return fin("invalid_input");
      const state = initState(cfg);
      const sessionId = await deps.store.createSession(uid, scenario.id, state);
      return finish(deps, "sim", t0, json(cors, {
        session_id: sessionId,
        title: scenario.title,
        opening: cfg.opening, // static scenario text: no LLM call, no quota
        state: publicState(state),
        status: "active",
        max_turns: cfg.max_turns,
        review: cfg.review.status, // "needs_medical_review" until a clinician signs the scenario off
      }), uid, undefined, { turn: 0 });
    }

    if (body.action === "end") {
      const status = await deps.store.endSession(uid, body.sessionId);
      if (!status) return fin("not_found"); // someone else's session is indistinguishable from a missing one
      return finish(deps, "sim", t0, json(cors, { status }), uid);
    }

    // ---------------------------------------------------------------- turn
    const session = await deps.store.getSession(uid, body.sessionId);
    if (!session) return fin("not_found");
    if (session.status !== "active") return fin("session_closed");
    const scenario = await deps.store.getScenario(session.scenario_id);
    const cfg = scenario ? parseSimConfig(scenario.sim) : null;
    if (!scenario || !cfg) return fin("not_found");
    const prev = parseState(session.state, cfg);
    if (!prev) return fin("upstream_error"); // corrupt state is a server problem; nothing was spent

    const r = await reserve(ctx, 1); // ONE message for the whole turn; also the global budget kill switch
    if ("res" in r) return r.res;
    const quota: Quota = r.quota;
    if (!(await deps.store.claimSessionTurn(uid, session.id, session.turn_count))) {
      await deps.store.refundQuota(uid, 1, quota.day).catch(() => {});
      return fin("session_busy"); // another turn on this session is in flight
    }

    const meter: Meter = { input: 0, output: 0, cost: 0, calls: 0 };
    const meta = (extra: Partial<LogEntry> = {}): Partial<LogEntry> =>
      ({ input_tokens: meter.input, output_tokens: meter.output, cost_usd: meter.cost, calls: meter.calls, ...extra });
    // Nothing is committed yet: drop the turn lock and give the user's quota back. Tokens already spent stay recorded.
    let committed = false;
    const abandon = async (code: ErrorCode, extra: Partial<LogEntry> = {}) => {
      if (!committed) await deps.store.releaseSessionTurn(uid, session.id).catch(() => {});
      await deps.store.refundQuota(uid, 1, quota.day).catch(() => {});
      return fin(code, meta(extra));
    };

    const runTurn = async (): Promise<Response> => {
      const llm = deps.llm();
      const chatModel = ctx.profile.tier.chat_model ?? llm.chatModel;
      const classifyModel = llm.classifyModel ?? chatModel;
      const last = body.messages[body.messages.length - 1];
      const before = body.messages[body.messages.length - 2];

      // 1. classify
      let classified;
      try {
        const content = await runLlm(ctx, meter, {
          model: classifyModel,
          messages: [
            { role: "system", content: buildClassifierSystemPrompt(cfg) },
            { role: "user", content: buildClassifierUserMessage(before?.role === "assistant" ? before.content : null, last.content) },
          ],
          temperature: CLASSIFY_TEMPERATURE,
          maxTokens: CLASSIFY_MAX_OUTPUT_TOKENS,
          json: true,
        });
        classified = parseClassification(content, cfg);
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e;
        return await abandon("upstream_error");
      }
      if (!classified.ok) return await abandon("upstream_error"); // malformed classifier output: no state change, no charge to the user

      // 2. engine (pure code)
      const result = applyTurn(cfg, prev, classified.actions);

      // 3. narrate from the new state
      let reply: string | null;
      try {
        reply = await runLlm(ctx, meter, {
          model: chatModel,
          messages: [{ role: "system", content: buildNarrationPrompt(cfg, scenario.language, result.state, result.events) }, ...body.messages],
          temperature: NARRATE_TEMPERATURE,
          maxTokens: ctx.profile.tier.max_output_tokens,
          json: false,
        });
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e;
        return await abandon("upstream_error", { rejected_actions: classified.dropped });
      }
      if (reply === null) return await abandon("upstream_error", { rejected_actions: classified.dropped });
      const verdict = checkNarration(reply, allowedNumbers(cfg, result.state));
      // A blank reply means the provider produced nothing usable (e.g. a reasoning model ran out of tokens): treat it
      // as a failed call, not as a filtered one, so the clock does not move behind a "can't answer" line.
      if (!verdict.ok && verdict.reason === "empty") return await abandon("upstream_error", { rejected_actions: classified.dropped });
      const text = verdict.ok ? verdict.text : cfg.fallback_reply;

      // 4. commit: only now does the hidden state change
      const status = result.ended ? "completed" : "active";
      if (!(await deps.store.commitSessionTurn(uid, session.id, session.turn_count, result.state, status))) {
        await deps.store.refundQuota(uid, 1, quota.day).catch(() => {});
        return fin("session_closed", meta({ rejected_actions: classified.dropped }));
      }
      committed = true;
      return finish(deps, "sim", t0, json(cors, {
        reply: text,
        state: publicState(result.state),
        turn: result.state.turn,
        status,
        remaining: quota.remaining,
        limit: quota.limit,
      }), uid, undefined, meta({
        turn: result.state.turn,
        rejected_actions: classified.dropped,
        ...(verdict.ok ? {} : { narration_filtered: verdict.reason }),
      }));
    };
    try {
      return await runTurn();
    } catch {
      // Unexpected failure (e.g. a database error) after the turn was claimed: nothing committed, so give it all back.
      return await abandon("upstream_error");
    }
  };
}
