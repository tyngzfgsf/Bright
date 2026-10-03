export type Role = "user" | "assistant";
export interface Msg { role: Role; content: string }
export type Lang = "ko" | "en";

export interface RubricItem { id: string; text: string; points: number; /** skill tags, see sim/rubric.ts */ tags?: string[] }
export interface Scenario {
  id: string;
  slug: string;
  language: Lang;
  title: string;
  system_prompt: string;
  rubric: RubricItem[];
  /** Server-only patient-state engine config (raw JSON, validated by sim/simconfig.ts). null => not a simulation scenario. */
  sim: unknown | null;
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
  /** Small/cheap model for the per-turn action classifier. Falls back to the chat model. */
  classifyModel: string | null;
  priceOverride?: Price;
  extraBody: Record<string, unknown>;
}

export interface SessionRow {
  id: string;
  scenario_id: string;
  /** Raw JSON from the database; validate with sim/engine.ts parseState before trusting it. */
  state: unknown;
  /** Committed turns. */
  turn_count: number;
  status: "active" | "completed" | "abandoned";
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
  // ---- simulation sessions. Every call is scoped to `uid`; another user's session looks like a missing one.
  createSession(uid: string, scenarioId: string, state: unknown): Promise<string>;
  getSession(uid: string, id: string): Promise<SessionRow | null>;
  /** Takes the session's turn lock; false if the session is not active, not at `expectedTurnCount`, or another turn holds the lock. */
  claimSessionTurn(uid: string, id: string, expectedTurnCount: number): Promise<boolean>;
  /** Commits a turn: writes the new state, bumps turn_count and drops the lock. `status` is the status after the turn. */
  commitSessionTurn(uid: string, id: string, expectedTurnCount: number, state: unknown, status: "active" | "completed"): Promise<boolean>;
  releaseSessionTurn(uid: string, id: string): Promise<void>;
  /** Resulting status, or null when the session is not this user's. */
  endSession(uid: string, id: string): Promise<SessionRow["status"] | null>;
}

export interface LogEntry {
  fn: "chat" | "grade" | "sim";
  uid?: string;
  status: number;
  code?: string;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  /** LLM calls made for this request (a simulation turn makes 2). */
  calls?: number;
  turn?: number;
  /** Unknown classifier ids rejected this turn (a count; never the ids or any text). */
  rejected_actions?: number;
  /** Narration replaced by the fixed fallback line: "dose" | "number" | "link" | "empty". */
  narration_filtered?: string;
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
