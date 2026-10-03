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
  chat_model: string;
  grade_model: string;
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
  reasoningEffort: "low" | "medium" | "high";
}
export interface Usage { input: number; cachedInput: number; output: number }

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
  groqBaseUrl: string;
  groqKey(): string | undefined;
  allowedOrigins: string[];
  dailyBudgetUsd: number;
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
  /** Metadata only. Never pass message content here. */
  log(entry: LogEntry): void;
}
