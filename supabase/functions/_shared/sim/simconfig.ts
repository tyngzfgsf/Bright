// Strict validation of scenarios.sim (JSON from the database). A typo in a scenario must fail loudly here
// (and in the scenario tests), never silently change what the engine does. Unknown keys are rejected.
import { hasDose } from "./safety.ts";
import {
  CONSCIOUSNESS, VITAL_BOUNDS, VITALS,
  type ActionDef, type Cond, type Consciousness, type Effect, type Rule, type SimConfig, type Vital,
} from "./types.ts";

export class SimConfigError extends Error {}

const ID = /^[a-z][a-z0-9_]{0,39}$/;
const fail = (why: string): never => {
  throw new SimConfigError(why);
};

function obj(raw: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(`${what}: object expected`);
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${what}: unknown key "${k}"`);
  return o;
}
function str(v: unknown, what: string, max: number, min = 1): string {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) return fail(`${what}: string ${min}..${max} chars expected`);
  return v;
}
function int(v: unknown, what: string, lo: number, hi: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) return fail(`${what}: integer ${lo}..${hi} expected`);
  return v;
}
function arr(v: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) return fail(`${what}: array of at most ${max} expected`);
  return v;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) return fail(`${what}: one of ${allowed.join("|")}`);
  return v as T;
}
function id(v: unknown, what: string): string {
  if (typeof v !== "string" || !ID.test(v)) return fail(`${what}: id must match ${ID}`);
  return v;
}
/** Text the LLM will see and may repeat: no dose-shaped phrases, ever. `noDigits` for outcome-type text. */
function llmText(v: unknown, what: string, max: number, opts: { noDigits?: boolean; min?: number } = {}): string {
  const s = str(v, what, max, opts.min ?? 0);
  if (hasDose(s)) fail(`${what}: contains a dose-shaped phrase (doses must never be authored into scenarios)`);
  if (opts.noDigits && /\d/.test(s)) fail(`${what}: must not contain numbers`);
  return s;
}

type Ctx = { actions: Set<string>; flags: Set<string> };

function cond(raw: unknown, ctx: Ctx, what: string): Cond {
  const t = (raw as { type?: unknown } | null)?.type;
  const action = (o: Record<string, unknown>) => {
    const a = id(o.action, `${what}.action`);
    if (!ctx.actions.has(a)) fail(`${what}: unknown action "${a}"`);
    return a;
  };
  const flag = (o: Record<string, unknown>) => {
    const f = id(o.flag, `${what}.flag`);
    if (!ctx.flags.has(f)) fail(`${what}: undeclared flag "${f}"`);
    return f;
  };
  switch (t) {
    case "done": case "not_done": case "done_now": {
      const o = obj(raw, ["type", "action"], what);
      return { type: t, action: action(o) };
    }
    case "flag": case "not_flag": {
      const o = obj(raw, ["type", "flag"], what);
      return { type: t, flag: flag(o) };
    }
    case "turn_gte": case "turn_lt": {
      const o = obj(raw, ["type", "value"], what);
      return { type: t, value: int(o.value, `${what}.value`, 0, 1000) };
    }
    case "clock_gte": {
      const o = obj(raw, ["type", "value"], what);
      return { type: t, value: int(o.value, `${what}.value`, 0, 100000) };
    }
    case "vital": {
      const o = obj(raw, ["type", "vital", "op", "value"], what);
      const vital = oneOf<Vital>(o.vital, VITALS, `${what}.vital`);
      return { type: t, vital, op: oneOf(o.op, ["lt", "lte", "gt", "gte"] as const, `${what}.op`), value: int(o.value, `${what}.value`, ...VITAL_BOUNDS[vital]) };
    }
    case "consciousness": {
      const o = obj(raw, ["type", "value"], what);
      return { type: t, value: oneOf<Consciousness>(o.value, CONSCIOUSNESS, `${what}.value`) };
    }
    default: return fail(`${what}: unknown condition type`);
  }
}

function effect(raw: unknown, ctx: Ctx, what: string): Effect {
  const t = (raw as { type?: unknown } | null)?.type;
  const flag = (o: Record<string, unknown>) => {
    const f = id(o.flag, `${what}.flag`);
    if (!ctx.flags.has(f)) fail(`${what}: undeclared flag "${f}"`);
    return f;
  };
  switch (t) {
    case "add": {
      const o = obj(raw, ["type", "vital", "amount"], what);
      return { type: t, vital: oneOf<Vital>(o.vital, VITALS, `${what}.vital`), amount: int(o.amount, `${what}.amount`, -200, 200) };
    }
    case "set": {
      const o = obj(raw, ["type", "vital", "value"], what);
      const vital = oneOf<Vital>(o.vital, VITALS, `${what}.vital`);
      return { type: t, vital, value: int(o.value, `${what}.value`, ...VITAL_BOUNDS[vital]) };
    }
    case "toward": {
      const o = obj(raw, ["type", "vital", "target", "step"], what);
      const vital = oneOf<Vital>(o.vital, VITALS, `${what}.vital`);
      return { type: t, vital, target: int(o.target, `${what}.target`, ...VITAL_BOUNDS[vital]), step: int(o.step, `${what}.step`, 1, 100) };
    }
    case "set_flag": case "clear_flag": {
      const o = obj(raw, ["type", "flag"], what);
      return { type: t, flag: flag(o) };
    }
    case "set_consciousness": {
      const o = obj(raw, ["type", "value"], what);
      return { type: t, value: oneOf<Consciousness>(o.value, CONSCIOUSNESS, `${what}.value`) };
    }
    case "end": {
      obj(raw, ["type"], what);
      return { type: t };
    }
    default: return fail(`${what}: unknown effect type`);
  }
}

/** Throws SimConfigError with the reason. Used by tests and the seed generator. */
export function parseSimConfigOrThrow(raw: unknown): SimConfig {
  const o = obj(raw, ["version", "review", "turn_seconds", "max_turns", "opening", "fallback_reply", "persona", "initial", "flags", "actions", "rules"], "sim");
  if (o.version !== 1) fail("sim.version must be 1");
  const rv = obj(o.review, ["status", "note"], "review");
  const review = {
    status: oneOf(rv.status, ["needs_medical_review", "reviewed"] as const, "review.status"),
    note: str(rv.note, "review.note", 500),
  };

  // Declare flags and actions first so every reference can be checked.
  const flagsRaw = obj(o.flags, Object.keys(o.flags && typeof o.flags === "object" ? o.flags : {}), "flags");
  const flagIds = Object.keys(flagsRaw);
  if (flagIds.length > 40) fail("flags: at most 40");
  const flags: Record<string, string> = {};
  for (const f of flagIds) flags[id(f, "flags")] = llmText(flagsRaw[f], `flags.${f}`, 200, { noDigits: true, min: 1 });

  const actionsRaw = arr(o.actions, "actions", 40);
  const actionIds = new Set<string>();
  for (const a of actionsRaw) {
    const aid = id((a as { id?: unknown } | null)?.id, "actions[].id");
    if (actionIds.has(aid)) fail(`actions: duplicate id "${aid}"`);
    actionIds.add(aid);
  }
  const ctx: Ctx = { actions: actionIds, flags: new Set(flagIds) };

  const actions: ActionDef[] = actionsRaw.map((raw) => {
    const a = obj(raw, ["id", "description", "requires", "blocked_note", "repeatable", "extra_seconds", "outcome", "effects"], "action");
    const w = `action ${a.id}`;
    const requires = arr(a.requires ?? [], `${w}.requires`, 6).map((c, i) => cond(c, ctx, `${w}.requires[${i}]`));
    const blocked_note = llmText(a.blocked_note ?? "", `${w}.blocked_note`, 200, { noDigits: true, min: requires.length ? 1 : 0 });
    if (a.repeatable !== undefined && typeof a.repeatable !== "boolean") fail(`${w}.repeatable: boolean`);
    return {
      id: a.id as string,
      description: llmText(a.description, `${w}.description`, 300, { min: 1 }),
      requires,
      blocked_note,
      repeatable: a.repeatable === true,
      extra_seconds: int(a.extra_seconds ?? 0, `${w}.extra_seconds`, 0, 600),
      outcome: llmText(a.outcome, `${w}.outcome`, 300, { noDigits: true, min: 1 }),
      effects: arr(a.effects ?? [], `${w}.effects`, 10).map((e, i) => effect(e, ctx, `${w}.effects[${i}]`)),
    };
  });

  const ruleIds = new Set<string>();
  const rules: Rule[] = arr(o.rules, "rules", 40).map((raw) => {
    const r = obj(raw, ["id", "note", "when", "effects", "once", "narrate"], "rule");
    const rid = id(r.id, "rules[].id");
    if (ruleIds.has(rid)) fail(`rules: duplicate id "${rid}"`);
    ruleIds.add(rid);
    if (r.note !== undefined) str(r.note, `rule ${rid}.note`, 300); // author comment, not kept
    if (r.once !== undefined && typeof r.once !== "boolean") fail(`rule ${rid}.once: boolean`);
    return {
      id: rid,
      when: arr(r.when, `rule ${rid}.when`, 8).map((c, i) => cond(c, ctx, `rule ${rid}.when[${i}]`)),
      effects: arr(r.effects, `rule ${rid}.effects`, 10).map((e, i) => effect(e, ctx, `rule ${rid}.effects[${i}]`)),
      once: r.once === true,
      narrate: llmText(r.narrate ?? "", `rule ${rid}.narrate`, 300, { noDigits: true }),
    };
  });

  const ini = obj(o.initial, [...VITALS, "consciousness", "flags"], "initial");
  const initial = {
    hr: int(ini.hr, "initial.hr", ...VITAL_BOUNDS.hr),
    sbp: int(ini.sbp, "initial.sbp", ...VITAL_BOUNDS.sbp),
    dbp: int(ini.dbp, "initial.dbp", ...VITAL_BOUNDS.dbp),
    spo2: int(ini.spo2, "initial.spo2", ...VITAL_BOUNDS.spo2),
    rr: int(ini.rr, "initial.rr", ...VITAL_BOUNDS.rr),
    consciousness: oneOf<Consciousness>(ini.consciousness, CONSCIOUSNESS, "initial.consciousness"),
    flags: arr(ini.flags ?? [], "initial.flags", 40).map((f) => {
      const fid = id(f, "initial.flags[]");
      if (!ctx.flags.has(fid)) fail(`initial.flags: undeclared flag "${fid}"`);
      return fid;
    }),
  };

  return {
    version: 1,
    review,
    turn_seconds: int(o.turn_seconds, "turn_seconds", 5, 600),
    max_turns: int(o.max_turns, "max_turns", 1, 60),
    opening: llmText(o.opening, "opening", 600, { min: 1 }),
    fallback_reply: llmText(o.fallback_reply, "fallback_reply", 300, { min: 1 }),
    persona: llmText(o.persona, "persona", 1200, { min: 1 }),
    initial,
    flags,
    actions,
    rules,
  };
}

/** Production wrapper: a scenario with a broken sim config is treated as "not a simulation scenario". */
export function parseSimConfig(raw: unknown): SimConfig | null {
  try {
    return parseSimConfigOrThrow(raw);
  } catch (e) {
    if (e instanceof SimConfigError) return null;
    throw e;
  }
}
