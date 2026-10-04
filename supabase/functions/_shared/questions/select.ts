// Debrief question selection. Pure: the candidates are already approved-only and in the session's language
// (question_candidates in SQL); this only decides which few to show, in the order the product asks for:
//   (a) questions linked to rubric items missed in THIS session (same scenario), one per missed item per round
//   (b) questions for the user's weakest skill tags
//   (c) unseen questions as filler (same scenario first)
// Missed nothing -> 2 "stretch" questions (harder ones) from the weakest skill.
import type { QuestionCandidate } from "../types.ts";

export type PickReason = "missed" | "weak" | "new" | "stretch";
export interface Pick { question: QuestionCandidate; reason: PickReason }

export interface SelectInput {
  candidates: QuestionCandidate[];
  scenarioId: string;
  missedRubricIds: string[];
  /** Weakest first (from skill_stats). May be empty for a new user. */
  weakestTags: string[];
  /** The session scenario's own rubric tags: the stretch fallback when there is no skill history yet. */
  scenarioTags: string[];
}

export const STRETCH_COUNT = 2;
export const targetCount = (missed: number) => (missed === 0 ? STRETCH_COUNT : missed >= 2 ? 4 : 3);

/** Never-answered first, then least recently answered; id as the final tie-break so the result is deterministic. */
function fresher(a: QuestionCandidate, b: QuestionCandidate): number {
  const sa = a.attempts > 0 ? 1 : 0, sb = b.attempts > 0 ? 1 : 0;
  if (sa !== sb) return sa - sb;
  const ta = a.last_answered_at ? Date.parse(a.last_answered_at) : 0;
  const tb = b.last_answered_at ? Date.parse(b.last_answered_at) : 0;
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function selectDebriefQuestions(input: SelectInput): Pick[] {
  const pool = [...input.candidates].sort(fresher);
  const taken = new Set<string>();
  const out: Pick[] = [];
  const take = (q: QuestionCandidate | undefined, reason: PickReason) => {
    if (!q || taken.has(q.id)) return false;
    taken.add(q.id);
    out.push({ question: q, reason });
    return true;
  };
  const missed = [...new Set(input.missedRubricIds)];

  if (missed.length === 0) {
    const tagOrder = [...new Set([...input.weakestTags, ...input.scenarioTags])];
    const rank = (q: QuestionCandidate) => {
      const i = tagOrder.indexOf(q.skill_tag);
      return i === -1 ? tagOrder.length : i;
    };
    const byStretch = (minDifficulty: number) =>
      pool.filter((q) => q.difficulty >= minDifficulty && rank(q) < tagOrder.length)
        .sort((a, b) => rank(a) - rank(b) || b.difficulty - a.difficulty || fresher(a, b));
    for (const q of [...byStretch(2), ...byStretch(1)]) {
      if (out.length >= STRETCH_COUNT) break;
      take(q, "stretch");
    }
    return out;
  }

  const target = targetCount(missed.length);
  // (a) round-robin over missed rubric items, same scenario only
  for (let progress = true; progress && out.length < target;) {
    progress = false;
    for (const id of missed) {
      if (out.length >= target) break;
      const q = pool.find((c) => !taken.has(c.id) && c.scenario_id === input.scenarioId && c.rubric_item_id === id);
      if (take(q, "missed")) progress = true;
    }
  }
  // (b) round-robin over the weakest skill tags, any scenario
  for (let progress = true; progress && out.length < target;) {
    progress = false;
    for (const tag of input.weakestTags) {
      if (out.length >= target) break;
      if (take(pool.find((c) => !taken.has(c.id) && c.skill_tag === tag), "weak")) progress = true;
    }
  }
  // (c) unseen filler, this scenario first
  const unseen = pool.filter((c) => c.attempts === 0 && !taken.has(c.id))
    .sort((a, b) => Number(b.scenario_id === input.scenarioId) - Number(a.scenario_id === input.scenarioId) || fresher(a, b));
  for (const q of unseen) {
    if (out.length >= target) break;
    take(q, "new");
  }
  return out;
}
