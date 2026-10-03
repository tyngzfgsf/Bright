import { LLM_RETRY_DELAY_CAP_MS, LLM_RETRY_DELAY_MS } from "./config.ts";
import type { Deps } from "./types.ts";

export class UpstreamError extends Error {}

/**
 * POSTs an OpenAI-compatible chat completion to LLM_BASE_URL. One short retry on 429/5xx/network
 * error, then a generic failure. Never exposes or logs the upstream error body. `extraBody`
 * (LLM_EXTRA_BODY) is merged first, so it can never override model, messages or limits.
 */
export async function llmChat(
  deps: Deps,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const cfg = deps.llm();
  if (!cfg.apiKey || !cfg.baseUrl) throw new UpstreamError("not configured");
  const payload = JSON.stringify({ ...cfg.extraBody, ...body });
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response | null = null;
    try {
      res = await deps.fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: payload,
        signal,
      });
    } catch {
      res = null;
    }
    if (res && res.ok) return res;
    const retryable = res === null || res.status === 429 || res.status >= 500;
    const retryAfter = res ? Number(res.headers.get("retry-after")) : NaN;
    await res?.body?.cancel().catch(() => {});
    if (!retryable || attempt === 1) break;
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, LLM_RETRY_DELAY_CAP_MS)
      : LLM_RETRY_DELAY_MS;
    await deps.sleep(wait);
  }
  throw new UpstreamError("upstream failed");
}

/** Yields the `data:` payloads of an SSE body ("[DONE]" included). Comment lines (": keep-alive") are ignored. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (data) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
