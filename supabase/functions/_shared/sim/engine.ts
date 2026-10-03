// The patient-state engine: PURE functions, no network, no clock, no randomness. The same state, config and
// action ids always produce the same result, whatever model classified the message or narrates the reply.
// The input state is never mutated.
import {
  CONSCIOUSNESS, VITAL_BOUNDS, VITALS,
  type Cond, type Effect, type PatientState, type PublicState, type SimConfig, type TurnEvent, type TurnResult, type Vital,
} from "./types.ts";

const clampVital = (v: Vital, n: number) => {
  const [lo, hi] = VITAL_BOUNDS[v];
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

export function initState(cfg: SimConfig): PatientState {
  const i = cfg.initial;
  return {
    v: 1,
    turn: 0,
    clock_s: 0,
    hr: clampVital("hr", i.hr),
    sbp: clampVital("sbp", i.sbp),
    dbp: clampVital("dbp", i.dbp),
    spo2: clampVital("spo2", i.spo2),
    rr: clampVital("rr", i.rr),
    consciousness: i.consciousness,
    flags: [...new Set(i.flags)].sort(),
    done: {},
    fired: [],
    log: [],
  };
}

export function publicState(s: PatientState): PublicState {
  return { turn: s.turn, clock_s: s.clock_s, hr: s.hr, sbp: s.sbp, dbp: s.dbp, spo2: s.spo2, rr: s.rr, consciousness: s.consciousness };
}

function holds(c: Cond, s: PatientState, now: ReadonlySet<string>): boolean {
  switch (c.type) {
    case "done": return Object.hasOwn(s.done, c.action);
    case "not_done": return !Object.hasOwn(s.done, c.action);
    case "done_now": return now.has(c.action);
    case "flag": return s.flags.includes(c.flag);
    case "not_flag": return !s.flags.includes(c.flag);
    case "turn_gte": return s.turn >= c.value;
    case "turn_lt": return s.turn < c.value;
    case "clock_gte": return s.clock_s >= c.value;
    case "consciousness": return s.consciousness === c.value;
    case "vital": {
      const v = s[c.vital];
      return c.op === "lt" ? v < c.value : c.op === "lte" ? v <= c.value : c.op === "gt" ? v > c.value : v >= c.value;
    }
  }
}

/** Applies one effect to a (cloned) state. Returns true if the effect ends the session. */
function applyEffect(e: Effect, s: PatientState): boolean {
  switch (e.type) {
    case "add": s[e.vital] = clampVital(e.vital, s[e.vital] + e.amount); return false;
    case "set": s[e.vital] = clampVital(e.vital, e.value); return false;
    case "toward": {
      const cur = s[e.vital];
      const move = Math.min(Math.abs(e.target - cur), e.step) * Math.sign(e.target - cur);
      s[e.vital] = clampVital(e.vital, cur + move);
      return false;
    }
    case "set_flag": if (!s.flags.includes(e.flag)) s.flags = [...s.flags, e.flag].sort(); return false;
    case "clear_flag": s.flags = s.flags.filter((f) => f !== e.flag); return false;
    case "set_consciousness": s.consciousness = e.value; return false;
    case "end": return true;
  }
}

/**
 * One turn. `actionIds` is whatever the classifier returned; ids not defined by the scenario are ignored
 * here as a second line of defence. Order is canonical (config order), never the order the LLM listed them in.
 *   1. base clock time passes
 *   2. each classified action is applied (or blocked by its precondition, or ignored as a repeat)
 *   3. every rule is evaluated once, in config order, against the resulting state
 */
export function applyTurn(cfg: SimConfig, prev: PatientState, actionIds: readonly string[]): TurnResult {
  const s = structuredClone(prev);
  s.turn = prev.turn + 1;
  s.clock_s += cfg.turn_seconds;
  const wanted = new Set(actionIds);
  const applied: string[] = [];
  const blocked: string[] = [];
  const events: TurnEvent[] = [];
  const now = new Set<string>();
  let ended = false;

  for (const a of cfg.actions) {
    if (!wanted.has(a.id)) continue;
    const before = Object.hasOwn(s.done, a.id) ? s.done[a.id] : null;
    if (before && !a.repeatable) continue; // repeat of a one-off action: nothing happens
    if (!a.requires.every((c) => holds(c, s, now))) {
      blocked.push(a.id);
      events.push({ kind: "blocked", id: a.id, text: a.blocked_note });
      continue;
    }
    for (const e of a.effects) ended = applyEffect(e, s) || ended;
    s.clock_s += a.extra_seconds;
    now.add(a.id);
    applied.push(a.id);
    s.done[a.id] = before ? { first: before.first, last: s.turn, n: before.n + 1 } : { first: s.turn, last: s.turn, n: 1 };
    events.push({ kind: "action", id: a.id, text: a.outcome });
  }

  for (const r of cfg.rules) {
    if (r.once && s.fired.includes(r.id)) continue;
    if (!r.when.every((c) => holds(c, s, now))) continue;
    for (const e of r.effects) ended = applyEffect(e, s) || ended;
    if (r.once) s.fired = [...s.fired, r.id];
    if (r.narrate) events.push({ kind: "rule", id: r.id, text: r.narrate });
  }

  ended = ended || s.turn >= cfg.max_turns;
  s.log = [...s.log, { turn: s.turn, clock_s: s.clock_s, actions: applied, blocked }];
  return { state: s, events, applied, ended };
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * The engine log in words, for the grader: what was done and when, what was blocked, what was never done,
 * and where the patient ended up. Built only from engine state; contains no trainee text.
 */
export function describeEngineLog(cfg: SimConfig, s: PatientState): string {
  const desc = new Map(cfg.actions.map((a) => [a.id, a.description]));
  const lines = s.log
    .filter((e) => e.actions.length > 0 || e.blocked.length > 0)
    .map((e) => {
      const did = e.actions.map((id) => `${id} (${desc.get(id) ?? "?"})`).join("; ");
      const blk = e.blocked.length ? ` | attempted but not possible yet: ${e.blocked.join(", ")}` : "";
      return `- turn ${e.turn} @ ${mmss(e.clock_s)}: ${did || "(nothing)"}${blk}`;
    });
  const never = cfg.actions.filter((a) => !Object.hasOwn(s.done, a.id)).map((a) => a.id);
  return [
    `Turns played: ${s.turn}. Simulated time: ${mmss(s.clock_s)}.`,
    lines.length ? "Actions performed by the trainee, in order:\n" + lines.join("\n") : "Actions performed by the trainee: none.",
    `Actions never performed: ${never.length ? never.join(", ") : "none"}.`,
    `Final patient state: HR ${s.hr}, BP ${s.sbp}/${s.dbp}, SpO2 ${s.spo2}%, RR ${s.rr}, consciousness ${s.consciousness}.`,
  ].join("\n");
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Validates a state loaded from the database against the scenario. null => corrupt or foreign state. */
export function parseState(raw: unknown, cfg: SimConfig): PatientState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !isInt(o.turn) || o.turn < 0 || !isInt(o.clock_s) || o.clock_s < 0) return null;
  for (const v of VITALS) {
    const n = o[v];
    if (!isInt(n) || n < VITAL_BOUNDS[v][0] || n > VITAL_BOUNDS[v][1]) return null;
  }
  if (!CONSCIOUSNESS.includes(o.consciousness as never)) return null;
  if (!Array.isArray(o.flags) || !o.flags.every((f) => typeof f === "string" && Object.hasOwn(cfg.flags, f))) return null;
  if (!Array.isArray(o.fired) || !o.fired.every((f) => typeof f === "string" && cfg.rules.some((r) => r.id === f))) return null;
  if (typeof o.done !== "object" || o.done === null || Array.isArray(o.done)) return null;
  for (const [id, d] of Object.entries(o.done)) {
    const x = d as Record<string, unknown>;
    if (!cfg.actions.some((a) => a.id === id) || typeof x !== "object" || x === null || !isInt(x.first) || !isInt(x.last) || !isInt(x.n)) return null;
  }
  if (!Array.isArray(o.log) || o.log.length > 200) return null;
  for (const e of o.log) {
    const x = e as Record<string, unknown>;
    const ids = (a: unknown) => Array.isArray(a) && a.every((id) => typeof id === "string" && cfg.actions.some((d) => d.id === id));
    if (typeof x !== "object" || x === null || !isInt(x.turn) || !isInt(x.clock_s) || !ids(x.actions) || !ids(x.blocked)) return null;
  }
  return o as unknown as PatientState;
}
