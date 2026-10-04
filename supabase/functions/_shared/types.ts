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
  /** Turn cap for a chat session (also a cost cap). Simulation scenarios use their own sim.max_turns. */
  max_turns: number;
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
  /** Per-minute limit for the no-LLM functions (questions, reports, review): a separate bucket. */
  questionsRateLimitPerMinute: number;
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

export type SessionStatus = "active" | "completed" | "abandoned";
export type EndReason = "finished" | "turn_cap" | "inactive" | "superseded" | "scenario";

export interface SessionRow {
  id: string;
  scenario_id: string;
  /** Raw JSON from the database; validate with sim/engine.ts parseState before trusting it. */
  state: unknown;
  /** Committed turns. */
  turn_count: number;
  status: SessionStatus;
  language: Lang | null;
  max_turns: number;
  end_reason: EndReason | null;
  graded_at: string | null;
  score: number | null;
  /** Rubric item ids missed in this session (ids only, never text). */
  missed_rubric_ids: string[];
}

export interface ChatTurnClaim {
  ok: boolean;
  /** Why a claim failed: the session is over, another sim turn holds its lock, or it is not the caller's. */
  reason: "ended" | "busy" | "not_found" | null;
  turn_count: number;
  max_turns: number;
  status: SessionStatus | null;
}

/** A question as it may leave the server: no correct_option_ids, no explanation. */
export interface QuestionOption { id: string; text: string }
export interface QuestionCandidate {
  id: string;
  scenario_id: string;
  rubric_item_id: string;
  skill_tag: string;
  language: Lang;
  type: "mcq" | "ordering" | "short";
  stem: string;
  options: QuestionOption[];
  difficulty: number;
  /** The caller's progress (0 / null when never answered). */
  attempts: number;
  last_answered_at: string | null;
  due_at: string | null;
}

/** Server-side only: the key, for checking an answer, plus the caller's progress for scheduling. */
export interface QuestionKeyed {
  id: string;
  skill_tag: string;
  type: "mcq" | "ordering" | "short";
  options: QuestionOption[];
  correct_option_ids: string[];
  explanation: string;
  /** null when the caller has no progress row yet. */
  ease: number | null;
  interval_days: number | null;
  attempts: number;
  correct_streak: number;
}

export interface SkillStat { skill_tag: string; attempts: number; misses: number }

export interface AnswerRecord {
  questionId: string;
  skillTag: string;
  correct: boolean;
  ease: number;
  intervalDays: number;
  correctStreak: number;
  expectedAttempts: number;
  context: "debrief" | "review";
}

/** Everything the functions need from the database. Production impl: store.ts (service role). */
export interface Store {
  getProfile(uid: string): Promise<Profile | null>;
  getScenario(id: string): Promise<Scenario | null>;
  getConfig(): Promise<AppConfig>;
  /** Fixed one-minute window per (user, scope). */
  checkRateLimit(uid: string, max: number, scope: "llm" | "questions"): Promise<boolean>;
  getGlobalCost(): Promise<number>;
  consumeQuota(uid: string, n: number): Promise<Quota>;
  refundQuota(uid: string, n: number, day: string): Promise<void>;
  recordUsage(uid: string, input: number, output: number, costUsd: number): Promise<void>;
  // ---- sessions. Every call is scoped to `uid`; another user's session looks like a missing one. `now` is the
  // server's clock (Deps.now), passed through so the inactivity rule can be tested.
  createSession(uid: string, scenarioId: string, state: unknown, language: Lang, maxTurns: number, now: Date): Promise<string>;
  /** Applies the 30-minute inactivity rule first, so the returned status is current. */
  getSession(uid: string, id: string, now: Date): Promise<SessionRow | null>;
  /** One chat turn, atomically: active + not idle + under the cap. The turn that reaches the cap completes the session. */
  claimChatTurn(uid: string, id: string, now: Date): Promise<ChatTurnClaim>;
  /** Gives back a claimed turn whose LLM call failed (compare-and-swap on the claimed turn_count). */
  unclaimChatTurn(uid: string, id: string, claimedTurnCount: number): Promise<void>;
  /** Finish & score: active -> completed. Resulting status, or null when not the caller's. */
  finishSession(uid: string, id: string, now: Date): Promise<SessionStatus | null>;
  /** Stores score + missed rubric ids once and feeds the skill profile. false if the session was already graded. */
  recordGrade(uid: string, id: string, score: number, items: { id: string; passed: boolean; tags: string[] }[], now: Date): Promise<boolean>;
  /** Takes the session's turn lock; false if the session is not active, not at `expectedTurnCount`, or another turn holds the lock. */
  claimSessionTurn(uid: string, id: string, expectedTurnCount: number): Promise<boolean>;
  /** Commits a turn: writes the new state, bumps turn_count and drops the lock. `status` is the status after the turn. */
  commitSessionTurn(uid: string, id: string, expectedTurnCount: number, state: unknown, status: "active" | "completed"): Promise<boolean>;
  releaseSessionTurn(uid: string, id: string): Promise<void>;
  /** Resulting status, or null when the session is not this user's. */
  endSession(uid: string, id: string): Promise<SessionRow["status"] | null>;
  // ---- question bank. Only status = 'approved' questions ever come back from these.
  /** Approved questions in one language, without answer keys, with the caller's progress. */
  questionCandidates(uid: string, language: Lang): Promise<QuestionCandidate[]>;
  /** Approved question with its key, or null. Server-side checking only; never returned before answering. */
  questionForAnswer(uid: string, id: string): Promise<QuestionKeyed | null>;
  /** Adds questions to the caller's review queue (due at `due`) unless already there. */
  enrollQuestions(uid: string, ids: string[], due: Date): Promise<void>;
  /** Writes progress, skill stats and activity for one answer. false on a lost race (nothing written). */
  recordAnswer(uid: string, a: AnswerRecord, now: Date): Promise<boolean>;
  /** Today's review (due before the end of the user's local day), capped at 10 a day, without keys. */
  reviewDue(uid: string, now: Date): Promise<QuestionCandidate[]>;
  reviewDueCount(uid: string, now: Date): Promise<number>;
  streak(uid: string, now: Date): Promise<{ current: number; today_counts: boolean }>;
  weakestSkills(uid: string, limit: number): Promise<SkillStat[]>;
  /** false when the question is not an approved one. */
  reportQuestion(uid: string, questionId: string, reason: string | null): Promise<boolean>;
}

export interface LogEntry {
  fn: "chat" | "grade" | "sim" | "start_session" | "get_questions" | "answer_question" | "review_queue" | "report_question";
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
  /** Questions served (a count; never ids or text). */
  served?: number;
  correct?: boolean;
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
  /** The server clock (ms since epoch). Injectable so session inactivity and scheduling can be tested. */
  now(): number;
  /** Metadata only. Never pass message content here. */
  log(entry: LogEntry): void;
}
