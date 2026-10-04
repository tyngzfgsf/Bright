// Bounded-session rules shared by start_session, chat, grade and get_questions. The rules that must hold under
// concurrency (turn cap, inactivity) are enforced in SQL; this file holds the decisions made on a row already read.
import { MIN_TURNS_GRADEABLE_ABANDONED, MIN_TURNS_GRADEABLE_COMPLETED } from "./config.ts";
import { errorResponse } from "./errors.ts";
import type { EndReason, Scenario, SessionRow } from "./types.ts";

/**
 * Hook for scenario-defined end conditions (e.g. "patient handed over", "ROSC achieved"). A non-null result would end
 * the session with end_reason 'scenario'. Nothing defines one yet: chat scenarios end by Finish & score, the turn cap
 * or inactivity, and simulation scenarios already end through their engine rules (sim/engine.ts).
 */
export function endConditionFor(_scenario: Scenario, _session: SessionRow): EndReason | null {
  return null;
}

/** 409 for any message to a session that is over. Says why, so the client can show "Session complete". */
export function sessionEndedResponse(cors: Headers, s: { status: string | null; end_reason?: string | null }): Response {
  return errorResponse("session_ended", cors, { status: s.status, end_reason: s.end_reason ?? null });
}

/** Can this (already ended) session be graded? A timed-out session needs a few turns to be worth an LLM call. */
export function isGradeable(s: SessionRow): boolean {
  if (s.status === "completed") return s.turn_count >= MIN_TURNS_GRADEABLE_COMPLETED;
  if (s.status === "abandoned") return s.turn_count >= MIN_TURNS_GRADEABLE_ABANDONED;
  return false;
}
