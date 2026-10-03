import type { LlmConfig, Price } from "./types.ts";

export const DEFAULT_LLM_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_LLM_MODEL = "openai/gpt-oss-20b";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);

/** The API key is only ever sent over https (plain http is allowed for local fake-provider tests). */
export function validBaseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname))) return null;
    if (u.username || u.password) return null;
    return raw.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Provider settings, all from Supabase secrets (server-only). Any OpenAI-compatible
 * /chat/completions endpoint works: OpenRouter by default, or another by changing LLM_BASE_URL.
 *   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL_CHAT, LLM_MODEL_GRADE
 *   optional: LLM_PRICE_INPUT_PER_M / LLM_PRICE_CACHED_INPUT_PER_M / LLM_PRICE_OUTPUT_PER_M (USD per 1M tokens),
 *             LLM_EXTRA_BODY (JSON object merged into every request, e.g. provider routing prefs)
 */
export function loadLlmConfig(get: (name: string) => string | undefined): LlmConfig {
  const baseUrl = validBaseUrl(get("LLM_BASE_URL")?.trim() || DEFAULT_LLM_BASE_URL);
  const input = num(get("LLM_PRICE_INPUT_PER_M"));
  const output = num(get("LLM_PRICE_OUTPUT_PER_M"));
  const priceOverride: Price | undefined = input !== undefined && output !== undefined
    ? { input, output, cached_input: num(get("LLM_PRICE_CACHED_INPUT_PER_M")) ?? input }
    : undefined;

  let extraBody: Record<string, unknown> = {};
  const rawExtra = get("LLM_EXTRA_BODY");
  if (rawExtra) {
    try {
      const parsed = JSON.parse(rawExtra);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) extraBody = parsed;
    } catch { /* ignore malformed extras */ }
  }
  return {
    baseUrl,
    apiKey: get("LLM_API_KEY")?.trim() || undefined,
    chatModel: get("LLM_MODEL_CHAT")?.trim() || DEFAULT_LLM_MODEL,
    gradeModel: get("LLM_MODEL_GRADE")?.trim() || DEFAULT_LLM_MODEL,
    priceOverride,
    extraBody,
  };
}
