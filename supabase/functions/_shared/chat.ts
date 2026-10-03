import { CHAT_TEMPERATURE, MAX_BODY_BYTES } from "./config.ts";
import { costUsd, estimateUsage, extractUsage, reasoningParam } from "./cost.ts";
import { errorResponse } from "./errors.ts";
import { llmChat, sseData, UpstreamError } from "./llm.ts";
import { finish, guard, reserve, type Ctx } from "./pipeline.ts";
import { buildAskSystemPrompt, buildChatSystemPrompt } from "./prompt.ts";
import type { Deps, Quota, Usage } from "./types.ts";
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
    const scenario = await deps.store.getScenario(input.scenarioId);
    if (!scenario || scenario.language !== input.language) {
      return finish(deps, "chat", t0, errorResponse("invalid_input", cors), uid, "invalid_input");
    }

    const r = await reserve(ctx, 1);
    if ("res" in r) return r.res;
    const quota = r.quota;

    const model = ctx.profile.tier.chat_model ?? deps.llm().chatModel;
    const maxOut = ctx.profile.tier.max_output_tokens;
    const system = input.mode === "ask"
      ? buildAskSystemPrompt(scenario, input.language)
      : buildChatSystemPrompt(scenario, input);
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
      await deps.store.refundQuota(uid, 1, quota.day).catch(() => {});
      return finish(deps, "chat", t0, errorResponse("upstream_error", cors), uid, "upstream_error");
    }

    return streamBack(ctx, upstream, abort, { model, maxOut, quota, messages });
  };
}

function streamBack(
  ctx: Ctx,
  upstream: Response,
  abort: AbortController,
  o: { model: string; maxOut: number; quota: Quota; messages: { content: string }[] },
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
        await deps.store.refundQuota(uid, 1, o.quota.day).catch(() => {});
        status = 502;
        code = "upstream_error";
        safe(new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ error: "upstream_error" })}\n\n`));
      } else {
        if (failed) { status = 502; code = "upstream_error"; }
        safe(sse({ done: true, remaining: o.quota.remaining, limit: o.quota.limit }));
      }

      // Bill what was actually used; if the stream never reported usage, charge a conservative estimate.
      const used = usage ?? estimateUsage(o.messages, o.maxOut);
      const cost = costUsd(ctx.config, deps.llm(), o.model, used);
      await deps.store.recordUsage(uid, used.input, used.output, cost).catch(() => {});
      deps.log({ fn: "chat", uid, status, code, latency_ms: Date.now() - t0, input_tokens: used.input, output_tokens: used.output, cost_usd: cost });
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
  return new Response(stream, { status: 200, headers: h });
}
