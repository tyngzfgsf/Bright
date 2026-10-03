// Fixed limits. Model names, prices and per-tier limits live in the database (tiers/app_config).
export const MAX_BODY_BYTES = { chat: 32 * 1024, grade: 96 * 1024 };
export const MAX_CHAT_MESSAGES = 10; // older history is trimmed server-side
export const MAX_GRADE_MESSAGES = 60;
export const MAX_MESSAGE_CHARS = 1500;
export const GRADE_QUOTA_COST = 2; // a grade counts as 2 messages
export const CHAT_TEMPERATURE = 0.7;
export const GRADE_TEMPERATURE = 0.2;
export const GRADE_MAX_OUTPUT_TOKENS = 1200;
export const LLM_RETRY_DELAY_MS = 500;
export const LLM_RETRY_DELAY_CAP_MS = 2000;
// Last-resort price (USD per 1M tokens) when no price is configured anywhere: deliberately high so the
// budget kill switch trips early rather than late. Set real prices in app_config or LLM_PRICE_* secrets.
export const SAFETY_PRICE = { input: 1.0, cached_input: 1.0, output: 3.0 };

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export const TRAINEE_ROLES = ["doctor", "nurse", "emt"] as const;
export const TRIAGE_SYSTEMS = ["KTAS", "ESI"] as const;
export const AI_ROLES = ["patient", "doctor"] as const;
export const MODES = ["turn", "ask"] as const;
