// Patient-state engine types. Everything here is server-side data: the client only ever sees PublicState.

export const VITALS = ["hr", "sbp", "dbp", "spo2", "rr"] as const;
export type Vital = (typeof VITALS)[number];

// Hard physiological clamps: whatever a rule says, a vital can never leave these.
export const VITAL_BOUNDS: Record<Vital, readonly [number, number]> = {
  hr: [0, 250],
  sbp: [0, 260],
  dbp: [0, 160],
  spo2: [0, 100],
  rr: [0, 60],
};

// AVPU, best to worst.
export const CONSCIOUSNESS = ["alert", "verbal", "pain", "unresponsive"] as const;
export type Consciousness = (typeof CONSCIOUSNESS)[number];

export type Cond =
  | { type: "done"; action: string }
  | { type: "not_done"; action: string }
  | { type: "done_now"; action: string }
  | { type: "flag"; flag: string }
  | { type: "not_flag"; flag: string }
  | { type: "turn_gte"; value: number }
  | { type: "turn_lt"; value: number }
  | { type: "clock_gte"; value: number }
  | { type: "vital"; vital: Vital; op: "lt" | "lte" | "gt" | "gte"; value: number }
  | { type: "consciousness"; value: Consciousness };

export type Effect =
  | { type: "add"; vital: Vital; amount: number }
  | { type: "set"; vital: Vital; value: number }
  // Moves a vital toward `target` by at most `step` per turn and never overshoots.
  | { type: "toward"; vital: Vital; target: number; step: number }
  | { type: "set_flag"; flag: string }
  | { type: "clear_flag"; flag: string }
  | { type: "set_consciousness"; value: Consciousness }
  | { type: "end" };

export interface ActionDef {
  id: string;
  /** Plain-language description. Shown to the classifier LLM only. */
  description: string;
  /** All must hold for the action to take effect; otherwise it is "blocked" and `blocked_note` is narrated. */
  requires: Cond[];
  blocked_note: string;
  /** Default false: a repeat is ignored. Repeatable actions (e.g. a second dose) re-apply their effects. */
  repeatable: boolean;
  /** Simulated seconds this action costs on top of the turn's base time. */
  extra_seconds: number;
  /** What the narrator may report as having happened. Must not contain doses or numbers. */
  outcome: string;
  effects: Effect[];
}

export interface Rule {
  id: string;
  /** All conditions must hold. */
  when: Cond[];
  effects: Effect[];
  /** Fire at most once per session (tracked in state.fired). Default false: applies every turn while true. */
  once: boolean;
  /** What the narrator may report when this rule fires (e.g. "The patient looks paler and is sweating"). */
  narrate: string;
}

export interface SimConfig {
  version: 1;
  review: { status: "needs_medical_review" | "reviewed"; note: string };
  turn_seconds: number;
  max_turns: number;
  /** Static line shown when the session starts (no LLM call). */
  opening: string;
  /** Shown instead of a narration that fails the safety filter. */
  fallback_reply: string;
  /** Who the patient is and facts the patient can state. LLM-facing. */
  persona: string;
  initial: {
    hr: number; sbp: number; dbp: number; spo2: number; rr: number;
    consciousness: Consciousness;
    flags: string[];
  };
  /** flag id -> plain-language meaning, for the narrator. */
  flags: Record<string, string>;
  actions: ActionDef[];
  rules: Rule[];
}

export interface LogEntry {
  turn: number;
  clock_s: number;
  /** Action ids that took effect this turn, in canonical (config) order. */
  actions: string[];
  /** Action ids the trainee attempted that were blocked by a precondition. */
  blocked: string[];
}

export interface PatientState {
  v: 1;
  /** Committed turns so far. */
  turn: number;
  /** Simulated seconds since the scenario started. */
  clock_s: number;
  hr: number; sbp: number; dbp: number; spo2: number; rr: number;
  consciousness: Consciousness;
  flags: string[];
  /** action id -> { first turn, last turn, count } */
  done: Record<string, { first: number; last: number; n: number }>;
  /** ids of `once` rules that have fired */
  fired: string[];
  /** The engine log: which actions happened on which turn. Fed to the grader. Never contains message text. */
  log: LogEntry[];
}

/** What the client may see: the monitor, never flags, log or rules. */
export interface PublicState {
  turn: number;
  clock_s: number;
  hr: number; sbp: number; dbp: number; spo2: number; rr: number;
  consciousness: Consciousness;
}

export interface TurnEvent {
  kind: "action" | "blocked" | "rule";
  id: string;
  /** English, LLM-facing text for the narrator. */
  text: string;
}

export interface TurnResult {
  state: PatientState;
  events: TurnEvent[];
  applied: string[];
  ended: boolean;
}
