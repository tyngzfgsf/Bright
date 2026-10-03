import { SAFETY_PRICE } from "./config.ts";
import type { AppConfig, LlmConfig, Msg, Price, Usage } from "./types.ts";

/** Price lookup order: app_config.prices[model] -> LLM_PRICE_* secrets -> app_config.prices.default -> safety price. */
export function priceFor(cfg: AppConfig, llm: LlmConfig, model: string): Price {
  return cfg.prices[model] ?? llm.priceOverride ?? cfg.prices["default"] ?? SAFETY_PRICE;
}

/** Computed from configured per-token prices; a provider-reported cost, when present, wins. */
export function costUsd(cfg: AppConfig, llm: LlmConfig, model: string, u: Usage): number {
  if (typeof u.reportedCost === "number" && Number.isFinite(u.reportedCost) && u.reportedCost >= 0) return u.reportedCost;
  const p = priceFor(cfg, llm, model);
  const cached = Math.min(u.cachedInput, u.input);
  return ((u.input - cached) * p.input + cached * p.cached_input + u.output * p.output) / 1_000_000;
}

/** Conservative fallback when the provider does not report usage: bytes/2 for input, the full cap for output. */
export function estimateUsage(messages: Msg[] | { content: string }[], maxOutputTokens: number): Usage {
  const bytes = messages.reduce((n, m) => n + new TextEncoder().encode(m.content).length, 0);
  return { input: Math.ceil(bytes / 2), cachedInput: 0, output: maxOutputTokens };
}

// deno-lint-ignore no-explicit-any
export function extractUsage(chunk: any): Usage | null {
  const u = chunk?.usage;
  if (!u || typeof u.prompt_tokens !== "number" || typeof u.completion_tokens !== "number") return null;
  const cached = u.prompt_tokens_details?.cached_tokens;
  return {
    input: u.prompt_tokens,
    cachedInput: typeof cached === "number" ? cached : 0,
    output: u.completion_tokens,
    reportedCost: typeof u.cost === "number" ? u.cost : undefined,
  };
}

/** OpenAI-style `reasoning_effort`; the value "off" (or empty) omits it for providers that reject it. */
export function reasoningParam(effort: string): Record<string, string> {
  return effort && effort !== "off" ? { reasoning_effort: effort } : {};
}
