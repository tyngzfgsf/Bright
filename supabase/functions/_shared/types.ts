export type Role = "user" | "assistant";
export interface Msg { role: Role; content: string }
export type Lang = "ko" | "en";

export interface RubricItem { id: string; text: string; points: number }
export interface Scenario {
  id: string;
  slug: string;
  language: Lang;
  title: string;
  system_prompt: string;
  rubric: RubricItem[];
}
export interface TierCfg {
  name: string;
  daily_message_limit: number;
  /** null => use the LLM_MODEL_CHAT / LLM_MODEL_GRADE secret. */
  chat_model: string | null;
  grade_model: string | null;
  max_output_tokens: number;
}
export interface Profile { tier: TierCfg; age_confirmed: boolean }
export interface Quota {
  allowed: boolean;
  remaining: number;
  limit: number;
  day: string;
  resets_at: string;
}
export interface Price { input: number; cached_input: number; output: number } // USD per 1M tokens
export interface AppConfig {
  prices: Record<string, Price>;
  rateLimitPerMinute: number;
  reasoningEffort: string; // "low" | "medium" | "high" | ... | "off"
}
export interface Usage {
  input: number;
  cachedInput: number;
  output: number;
  /** USD cost if the provider reports it (e.g. OpenRouter's usage.cost). */
  reportedCost?: number;
}

export interface LlmConfig {
  /** null => LLM_BASE_URL was invalid (e.g. plain http to a remote host); calls fail closed. */
  baseUrl: string | null;
  apiKey: string | undefined;
  chatModel: string;
  gradeModel: string;
  priceOverride?: Price;
  extraBody: Record<string, unknown>;
}

/** Everything the functions need from the database. Production impl: store.ts (service role). */
export interface Store {
  getProfile(uid: string): Promise<Profile | null>;
  getScenario(id: string): Promise<Scenario | null>;
  getConfig(): Promise<AppConfig>;
  checkRateLimit(uid: string, max: number): Promise<boolean>;
  getGlobalCost(): Promise<number>;
  consumeQuota(uid: string, n: number): Promise<Quota>;
  refundQuota(uid: string, n: number, day: string): Promise<void>;
  recordUsage(uid: string, input: number, output: number, costUsd: number): Promise<void>;
}

export interface LogEntry {
  fn: "chat" | "grade";
  uid?: string;
  status: number;
  code?: string;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

export interface Deps {
  store: Store;
  /** Returns the user id for a valid access token, else null. */
  verifyUser(accessToken: string): Promise<string | null>;
  /** Server-only provider settings (secrets). Read per call so a rotated secret takes effect. */
  llm(): LlmConfig;
  allowedOrigins: string[];
  dailyBudgetUsd: number;
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
  /** Metadata only. Never pass message content here. */
  log(entry: LogEntry): void;
}
