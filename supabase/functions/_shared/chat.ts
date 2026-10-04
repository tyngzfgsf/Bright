import { CHAT_TEMPERATURE, MAX_BODY_BYTES } from "./config.ts";
import { costUsd, estimateUsage, extractUsage, reasoningParam } from "./cost.ts";
import { errorResponse } from "./errors.ts";
import { llmChat, sseData, UpstreamError } from "./llm.ts";
import { finish, guard, reserve, type Ctx } from "./pipeline.ts";
import { buildAskSystemPrompt, buildChatSystemPrompt } from "./prompt.ts";
import { endConditionFor, sessionEndedResponse } from "./session.ts";
import type { ChatTurnClaim, Deps, Quota, Usage } from "./types.ts";
import { parseChatBody, ValidationError } from "./validate.ts";

const sse = (obj: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);

export function makeChatHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, deps, "chat", MAX_BODY_BYTES.chat);
    if ("res" in g) return g.res;
    const ctx = g.ctx;
    const { uid, cors, t0 } = ctx;

    let input;
    try {
      input = parseChatBody(ctx.body);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      return finish(deps, "chat", t0, errorResponse("invalid_input", cors), uid, "invalid_input");
    }

    // Every chat runs inside a bounded session. Its scenario, language and turn cap are server-side facts.
    const now = () => new Date(deps.now());
    const session = await deps.store.getSession(uid, input.sessionId, now());
    if (!session) return finish(deps, "chat", t0, errorResponse("not_found", cors), uid, "not_found");
    if (session.status !== "active") {
      return finish(deps, "chat", t0, sessionEndedResponse(cors, session), uid, "session_ended", { turn: session.turn_count });
    }
    const scenario = await deps.store.getScenario(session.scenario_id);
    // Simulation scenarios have their own endpoint (/sim): its engine owns the state, so chat must not bypass it.
    if (!scenario || scenario.sim != null || (input.scenarioId !== null && input.scenarioId !== scenario.id) ||
        (input.language !== null && input.language !== scenario.language)) {
      return finish(deps, "chat", t0, errorResponse("invalid_input", cors), uid, "invalid_input");
    }
    if (endConditionFor(scenario, session) !== null) {
      // Reserved for scenario-defined end conditions (none exist yet).
      await deps.store.finishSession(uid, session.id, now());
      return finish(deps, "chat", t0, sessionEndedResponse(cors, { status: "completed", end_reason: "scenario" }), uid, "session_ended");
    }

    const r = await reserve(ctx, 1);
    if ("res" in r) return r.res;
    const quota = r.quota;

    // Atomic: active, not idle, under the cap. The turn reaching the cap completes the session (its reply still comes).
    const claim = await deps.store.claimChatTurn(uid, session.id, now());
    if (!claim.ok) {
      await deps.store.refundQuota(uid, 1, quota.day).catch(() => {});
      if (claim.reason === "not_found") return finish(deps, "chat", t0, errorResponse("not_found", cors), uid, "not_found");
      if (claim.reason === "busy") return finish(deps, "chat", t0, errorResponse("session_busy", cors), uid, "session_busy");
      const after = await deps.store.getSession(uid, session.id, now());
      return finish(deps, "chat", t0, sessionEndedResponse(cors, after ?? { status: claim.status }), uid, "session_ended");
    }
    const giveBack = async () => {
      await deps.store.refundQuota(uid, 1, quota.day).catch(() => {});
      await deps.store.unclaimChatTurn(uid, session.id, claim.turn_count).catch(() => {});
    };
    const opts = { ...input, language: scenario.language };

    const model = ctx.profile.tier.chat_model ?? deps.llm().chatModel;
    const maxOut = ctx.profile.tier.max_output_tokens;
    const system = input.mode === "ask"
      ? buildAskSystemPrompt(scenario, opts.language)
      : buildChatSystemPrompt(scenario, opts);
    const messages: { role: string; content: string }[] = [{ role: "system", content: system }, ...input.messages];

    const abort = new AbortController();
    let upstream: Response;
    try {
      upstream = await llmChat(deps, {
        model,
        messages,
        temperature: CHAT_TEMPERATURE,
        max_tokens: maxOut,
        stream: true,
        ...reasoningParam(ctx.config.reasoningEffort),
      }, abort.signal);
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      await giveBack();
      return finish(deps, "chat", t0, errorResponse("upstream_error", cors), uid, "upstream_error");
    }

    return streamBack(ctx, upstream, abort, { model, maxOut, quota, messages, claim, giveBack });
  };
}

function streamBack(
  ctx: Ctx,
  upstream: Response,
  abort: AbortController,
  o: {
    model: string; maxOut: number; quota: Quota; messages: { content: string }[];
    claim: ChatTurnClaim; giveBack: () => Promise<void>;
  },
): Response {
  const { deps, uid, cors, t0 } = ctx;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safe = (chunk: Uint8Array) => {
        try { controller.enqueue(chunk); } catch { /* client went away */ }
      };
      let usage: Usage | null = null;
      let delivered = false;
      let failed = false;
      try {
        for await (const data of sseData(upstream.body!)) {
          if (data === "[DONE]") break;
          let chunk;
          try { chunk = JSON.parse(data); } catch { continue; }
          if (chunk?.error) { failed = true; break; } // providers may report mid-stream errors inside a 200 stream
          usage = extractUsage(chunk) ?? usage;
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            delivered = true;
            safe(sse({ delta })); // only our own envelope is forwarded, never raw upstream chunks
          }
        }
      } catch {
        failed = true;
      }
      if (!delivered) failed = true;

      let status = 200;
      let code: string | undefined;
      if (failed && !delivered) {
        await o.giveBack(); // nothing reached the trainee: the message and the turn are both returned
        status = 502;
        code = "upstream_error";
        safe(new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ error: "upstream_error" })}\n\n`));
      } else {
        if (failed) { status = 502; code = "upstream_error"; }
        safe(sse({
          done: true, remaining: o.quota.remaining, limit: o.quota.limit,
          // Session progress for the turn counter ("6 / 15") and the "Session complete" state.
          turn_count: o.claim.turn_count, max_turns: o.claim.max_turns, status: o.claim.status,
        }));
      }

      // Bill what was actually used; if the stream never reported usage, charge a conservative estimate.
      const used = usage ?? estimateUsage(o.messages, o.maxOut);
      const cost = costUsd(ctx.config, deps.llm(), o.model, used);
      await deps.store.recordUsage(uid, used.input, used.output, cost).catch(() => {});
      deps.log({ fn: "chat", uid, status, code, turn: o.claim.turn_count, latency_ms: Date.now() - t0, input_tokens: used.input, output_tokens: used.output, cost_usd: cost });
      try { controller.close(); } catch { /* already closed */ }
    },
    cancel() {
      abort.abort();
    },
  });
  const h = new Headers(cors);
  h.set("content-type", "text/event-stream");
  h.set("cache-control", "no-store");
  h.set("x-accel-buffering", "no");
  h.set("x-quota-remaining", String(o.quota.remaining));
  h.set("x-session-turn", `${o.claim.turn_count}/${o.claim.max_turns}`);
  return new Response(stream, { status: 200, headers: h });
}
