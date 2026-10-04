import {
  AI_ROLES, DIFFICULTIES, MAX_CHAT_MESSAGES, MAX_GRADE_MESSAGES, MAX_MESSAGE_CHARS, MODES,
  TRAINEE_ROLES, TRIAGE_SYSTEMS,
} from "./config.ts";
import { NARRATE_MAX_MESSAGES } from "./sim/narrate.ts";
import type { Lang, Msg } from "./types.ts";

export class ValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(why: string): never {
  throw new ValidationError(why);
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  if (v === undefined) return dflt;
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  return fail("enum");
}
function asObject(raw: unknown, keys: string[]): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("body");
  const o = raw as Record<string, unknown>;
  // Reject unknown keys outright: a client must never be able to smuggle in model, tokens, prompts, user_id.
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail("unknown key");
  return o;
}
function parseMessages(v: unknown, requireLastUser: boolean): Msg[] {
  if (!Array.isArray(v) || v.length === 0) fail("messages");
  const messages: Msg[] = v.map((m) => {
    if (typeof m !== "object" || m === null) fail("message");
    const { role, content } = m as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") fail("role"); // 'system' and anything else is rejected
    if (typeof content !== "string") fail("content");
    const text = content.trim();
    if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) fail("content length");
    return { role, content: text };
  });
  if (requireLastUser && messages[messages.length - 1].role !== "user") fail("last message must be from user");
  return messages;
}

/**
 * Every chat and grade runs inside a server-issued session: the scenario and language come from the session row.
 * A client may still echo scenario_id / language (older builds did); they are validated and must match the session.
 */
function sessionCommon(o: Record<string, unknown>, maxMessages: number, requireLastUser: boolean) {
  const sessionId = uuid(o.session_id, "session_id");
  const scenarioId = o.scenario_id === undefined ? null : uuid(o.scenario_id, "scenario_id");
  if (o.language !== undefined && o.language !== "ko" && o.language !== "en") fail("language");
  const messages = parseMessages(o.messages, requireLastUser);
  return {
    sessionId,
    scenarioId,
    language: (o.language ?? null) as Lang | null,
    messages: messages.slice(-maxMessages),
    totalMessages: messages.length,
  };
}

export function parseChatBody(raw: unknown) {
  const o = asObject(raw, [
    "session_id", "scenario_id", "language", "messages", "difficulty", "trainee_role", "triage_system", "ai_role", "mode",
  ]);
  return {
    ...sessionCommon(o, MAX_CHAT_MESSAGES, true),
    difficulty: oneOf(o.difficulty, DIFFICULTIES, "intermediate"),
    traineeRole: oneOf(o.trainee_role, TRAINEE_ROLES, "doctor"),
    triageSystem: oneOf(o.triage_system, TRIAGE_SYSTEMS, "ESI"),
    aiRole: oneOf(o.ai_role, AI_ROLES, "patient"),
    mode: oneOf(o.mode, MODES, "turn"),
  };
}

export function parseGradeBody(raw: unknown) {
  const o = asObject(raw, ["session_id", "scenario_id", "language", "messages"]);
  return sessionCommon(o, MAX_GRADE_MESSAGES, false);
}

/** start_session: the only place a client names a scenario. */
export function parseStartBody(raw: unknown): { scenarioId: string; language: Lang } {
  const o = asObject(raw, ["scenario_id", "language"]);
  if (o.language !== "ko" && o.language !== "en") fail("language");
  return { scenarioId: uuid(o.scenario_id, "scenario_id"), language: o.language as Lang };
}

export function parseGetQuestionsBody(raw: unknown): { sessionId: string } {
  const o = asObject(raw, ["session_id"]);
  return { sessionId: uuid(o.session_id, "session_id") };
}

const OPTION_ID = /^[a-z0-9]{1,8}$/;

/** answer_question: the client sends only what it picked. It can never send correctness, scores or progress. */
export function parseAnswerBody(raw: unknown): { questionId: string; selectedIds: string[]; context: "debrief" | "review" } {
  const o = asObject(raw, ["question_id", "selected_ids", "context"]);
  const questionId = uuid(o.question_id, "question_id");
  if (!Array.isArray(o.selected_ids) || o.selected_ids.length === 0 || o.selected_ids.length > 8) fail("selected_ids");
  const selectedIds = (o.selected_ids as unknown[]).map((v) => {
    if (typeof v !== "string" || !OPTION_ID.test(v)) fail("selected_id");
    return v as string;
  });
  if (new Set(selectedIds).size !== selectedIds.length) fail("duplicate selected_id");
  return { questionId, selectedIds, context: oneOf(o.context, ["debrief", "review"] as const, "debrief") };
}

export function parseEmptyBody(raw: unknown): Record<string, never> {
  asObject(raw, []);
  return {};
}

export const MAX_REPORT_REASON_CHARS = 280;

export function parseReportBody(raw: unknown): { questionId: string; reason: string | null } {
  const o = asObject(raw, ["question_id", "reason"]);
  const questionId = uuid(o.question_id, "question_id");
  if (o.reason !== undefined && o.reason !== null && typeof o.reason !== "string") fail("reason");
  const reason = typeof o.reason === "string" ? o.reason.trim() : "";
  if (reason.length > MAX_REPORT_REASON_CHARS) fail("reason length");
  return { questionId, reason: reason.length > 0 ? reason : null };
}

function uuid(v: unknown, what: string): string {
  if (typeof v !== "string" || !UUID.test(v)) return fail(what);
  return v;
}

/** Simulation endpoint. `action` selects the shape; each action has its own allow-list of keys. */
export type SimBody =
  | { action: "start"; scenarioId: string; language: Lang }
  | { action: "turn"; sessionId: string; messages: Msg[] }
  | { action: "end"; sessionId: string };

export function parseSimBody(raw: unknown): SimBody {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("body");
  const action = (raw as Record<string, unknown>).action;
  if (action === "start") {
    const o = asObject(raw, ["action", "scenario_id", "language"]);
    if (o.language !== "ko" && o.language !== "en") fail("language");
    return { action, scenarioId: uuid(o.scenario_id, "scenario_id"), language: o.language as Lang };
  }
  if (action === "turn") {
    // No model, prompt, token or limit keys: a turn is just a session handle plus recent chat history.
    const o = asObject(raw, ["action", "session_id", "messages"]);
    const sessionId = uuid(o.session_id, "session_id");
    if (!Array.isArray(o.messages) || o.messages.length === 0) fail("messages");
    const messages: Msg[] = (o.messages as unknown[]).map((m) => {
      if (typeof m !== "object" || m === null) fail("message");
      const { role, content } = m as Record<string, unknown>;
      if (role !== "user" && role !== "assistant") fail("role");
      if (typeof content !== "string") fail("content");
      const text = (content as string).trim();
      if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) fail("content length");
      return { role: role as Msg["role"], content: text };
    });
    if (messages[messages.length - 1].role !== "user") fail("last message must be from user");
    return { action, sessionId, messages: messages.slice(-NARRATE_MAX_MESSAGES) };
  }
  if (action === "end") {
    const o = asObject(raw, ["action", "session_id"]);
    return { action, sessionId: uuid(o.session_id, "session_id") };
  }
  return fail("action");
}
