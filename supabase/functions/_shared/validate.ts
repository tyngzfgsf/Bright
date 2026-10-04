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
function common(o: Record<string, unknown>, maxMessages: number, requireLastUser: boolean) {
  if (typeof o.scenario_id !== "string" || !UUID.test(o.scenario_id)) fail("scenario_id");
  const language = oneOf<Lang>(o.language, ["ko", "en"], "en");
  if (o.language === undefined) fail("language");
  if (!Array.isArray(o.messages) || o.messages.length === 0) fail("messages");
  const messages: Msg[] = o.messages.map((m) => {
    if (typeof m !== "object" || m === null) fail("message");
    const { role, content } = m as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") fail("role"); // 'system' and anything else is rejected
    if (typeof content !== "string") fail("content");
    const text = content.trim();
    if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) fail("content length");
    return { role, content: text };
  });
  if (requireLastUser && messages[messages.length - 1].role !== "user") fail("last message must be from user");
  return {
    scenarioId: o.scenario_id,
    language,
    messages: messages.slice(-maxMessages),
    totalMessages: messages.length,
  };
}

export function parseChatBody(raw: unknown) {
  const o = asObject(raw, [
    "scenario_id", "language", "messages", "difficulty", "trainee_role", "triage_system", "ai_role", "mode",
  ]);
  return {
    ...common(o, MAX_CHAT_MESSAGES, true),
    difficulty: oneOf(o.difficulty, DIFFICULTIES, "intermediate"),
    traineeRole: oneOf(o.trainee_role, TRAINEE_ROLES, "doctor"),
    triageSystem: oneOf(o.triage_system, TRIAGE_SYSTEMS, "ESI"),
    aiRole: oneOf(o.ai_role, AI_ROLES, "patient"),
    mode: oneOf(o.mode, MODES, "turn"),
  };
}

export function parseGradeBody(raw: unknown) {
  const o = asObject(raw, ["scenario_id", "language", "messages", "session_id"]);
  const parsed = common(o, MAX_GRADE_MESSAGES, false);
  // Optional: grade against a simulation session's engine log. An opaque, server-issued handle; ownership is checked server-side.
  const sessionId = o.session_id === undefined ? null : uuid(o.session_id, "session_id");
  return { ...parsed, sessionId };
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
