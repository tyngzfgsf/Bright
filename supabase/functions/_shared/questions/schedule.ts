// SM-2-style spaced repetition. Pure: no clock, no I/O. The caller adds `intervalDays` to "now" for the due date.
//   correct -> correct_streak + 1; interval 1 -> 3 -> round(previous interval * ease), capped; ease + 0.1
//   wrong   -> correct_streak 0; interval resets to 1 day; ease - 0.2
// Ease stays within [EASE_MIN, EASE_MAX] (the same bounds the question_progress CHECK constraint enforces).

export const EASE_START = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const EASE_UP = 0.1;
export const EASE_DOWN = 0.2;
export const MAX_INTERVAL_DAYS = 180;

export interface ScheduleState {
  /** null/undefined for a question never answered (or only enrolled). */
  ease?: number | null;
  intervalDays?: number | null;
  correctStreak?: number | null;
}

export interface ScheduleResult {
  ease: number;
  intervalDays: number;
  correctStreak: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
/** Garbage in (NaN, negative, absurd) is treated as "no history", never propagated. */
const sane = (v: number | null | undefined, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

export function schedule(prev: ScheduleState, correct: boolean): ScheduleResult {
  const ease = sane(prev.ease, EASE_MIN, EASE_MAX) ?? EASE_START;
  const interval = sane(prev.intervalDays, 0, MAX_INTERVAL_DAYS) ?? 0;
  const streak = Math.floor(sane(prev.correctStreak, 0, 100_000) ?? 0);

  if (!correct) {
    return { ease: round2(clamp(ease - EASE_DOWN, EASE_MIN, EASE_MAX)), intervalDays: 1, correctStreak: 0 };
  }
  const nextStreak = streak + 1;
  const nextInterval = nextStreak === 1 ? 1 : nextStreak === 2 ? 3 : Math.round(Math.max(interval, 1) * ease);
  return {
    ease: round2(clamp(ease + EASE_UP, EASE_MIN, EASE_MAX)),
    intervalDays: clamp(nextInterval, 1, MAX_INTERVAL_DAYS),
    correctStreak: nextStreak,
  };
}

export function dueAt(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * 86_400_000);
}
