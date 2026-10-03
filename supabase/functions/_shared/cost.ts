import type { AppConfig, Msg, Price, Usage } from "./types.ts";

/** Unknown model => the most expensive known price, so the budget errs on the safe side. */
function priceFor(cfg: AppConfig, model: string): Price {
  const known = cfg.prices[model];
  if (known) return known;
  return Object.values(cfg.prices).reduce(
    (a, b) => ({
      input: Math.max(a.input, b.input),
      cached_input: Math.max(a.cached_input, b.cached_input),
      output: Math.max(a.output, b.output),
    }),
    { input: 0, cached_input: 0, output: 0 },
  );
}

export function costUsd(cfg: AppConfig, model: string, u: Usage): number {
  const p = priceFor(cfg, model);
  const cached = Math.min(u.cachedInput, u.input);
  return ((u.input - cached) * p.input + cached * p.cached_input + u.output * p.output) / 1_000_000;
}

/** Conservative fallback when Groq does not report usage: bytes/2 for input, the full cap for output. */
export function estimateUsage(messages: Msg[] | { content: string }[], maxOutputTokens: number): Usage {
  const bytes = messages.reduce((n, m) => n + new TextEncoder().encode(m.content).length, 0);
  return { input: Math.ceil(bytes / 2), cachedInput: 0, output: maxOutputTokens };
}

// deno-lint-ignore no-explicit-any
export function extractUsage(chunk: any): Usage | null {
  const u = chunk?.usage ?? chunk?.x_groq?.usage;
  if (!u || typeof u.prompt_tokens !== "number" || typeof u.completion_tokens !== "number") return null;
  const cached = u.prompt_tokens_details?.cached_tokens;
  return {
    input: u.prompt_tokens,
    cachedInput: typeof cached === "number" ? cached : 0,
    output: u.completion_tokens,
  };
}
