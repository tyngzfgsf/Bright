import { assertEquals } from "@std/assert";
import { dueAt, EASE_MAX, EASE_MIN, EASE_START, MAX_INTERVAL_DAYS, schedule } from "./schedule.ts";

Deno.test("schedule: first answer correct -> 1 day, streak 1, ease up", () => {
  assertEquals(schedule({}, true), { ease: 2.6, intervalDays: 1, correctStreak: 1 });
});

Deno.test("schedule: first answer wrong -> 1 day, streak 0, ease down", () => {
  assertEquals(schedule({}, false), { ease: 2.3, intervalDays: 1, correctStreak: 0 });
});

Deno.test("schedule: an enrolled-but-unanswered question (interval 0) behaves like a first answer", () => {
  assertEquals(schedule({ ease: 2.5, intervalDays: 0, correctStreak: 0 }, true).intervalDays, 1);
});

Deno.test("schedule: correct answers grow the interval 1 -> 3 -> x ease", () => {
  let s = schedule({}, true);
  assertEquals(s.intervalDays, 1);
  s = schedule(s, true);
  assertEquals([s.intervalDays, s.correctStreak], [3, 2]);
  const before = s;
  s = schedule(s, true);
  assertEquals(s.intervalDays, Math.round(3 * before.ease));
  assertEquals(s.correctStreak, 3);
  const prev = s.intervalDays;
  s = schedule(s, true);
  assertEquals(s.intervalDays > prev, true);
});

Deno.test("schedule: a wrong answer after a long streak resets to 1 day and streak 0", () => {
  const s = schedule({ ease: 2.8, intervalDays: 60, correctStreak: 9 }, false);
  assertEquals(s, { ease: 2.6, intervalDays: 1, correctStreak: 0 });
});

Deno.test("schedule: ease never drops below the floor, however many misses", () => {
  let s = schedule({}, false);
  for (let i = 0; i < 20; i++) s = schedule(s, false);
  assertEquals(s.ease, EASE_MIN);
  assertEquals(s.intervalDays, 1);
});

Deno.test("schedule: ease never exceeds the cap, however many hits", () => {
  let s = schedule({}, true);
  for (let i = 0; i < 30; i++) s = schedule(s, true);
  assertEquals(s.ease, EASE_MAX);
});

Deno.test("schedule: the interval is capped", () => {
  assertEquals(schedule({ ease: 3.0, intervalDays: 170, correctStreak: 12 }, true).intervalDays, MAX_INTERVAL_DAYS);
  assertEquals(schedule({ ease: 3.0, intervalDays: MAX_INTERVAL_DAYS, correctStreak: 40 }, true).intervalDays, MAX_INTERVAL_DAYS);
});

Deno.test("schedule: garbage history is treated as no history (never NaN, never out of range)", () => {
  for (const bad of [
    { ease: Number.NaN, intervalDays: Number.NaN, correctStreak: Number.NaN },
    { ease: -5, intervalDays: -3, correctStreak: -1 },
    { ease: 99, intervalDays: 1e9, correctStreak: 1e12 },
    { ease: null, intervalDays: null, correctStreak: null },
    { ease: Infinity, intervalDays: Infinity, correctStreak: Infinity },
  ]) {
    for (const correct of [true, false]) {
      const s = schedule(bad, correct);
      assertEquals(Number.isFinite(s.ease) && s.ease >= EASE_MIN && s.ease <= EASE_MAX, true, JSON.stringify(bad));
      assertEquals(Number.isInteger(s.intervalDays) && s.intervalDays >= 1 && s.intervalDays <= MAX_INTERVAL_DAYS, true);
      assertEquals(Number.isInteger(s.correctStreak) && s.correctStreak >= 0, true);
    }
  }
  // no history at all starts from the default ease
  assertEquals(schedule({ ease: Number.NaN }, false).ease, Math.round((EASE_START - 0.2) * 100) / 100);
});

Deno.test("schedule: ease is kept at 2 decimals (fits numeric(4,2) in question_progress)", () => {
  let s = schedule({}, true);
  for (let i = 0; i < 7; i++) s = schedule(s, i % 2 === 0);
  assertEquals(Math.round(s.ease * 100) / 100, s.ease);
});

Deno.test("dueAt adds whole days", () => {
  const now = new Date("2026-10-05T23:30:00Z");
  assertEquals(dueAt(now, 1).toISOString(), "2026-10-06T23:30:00.000Z");
  assertEquals(dueAt(now, 3).toISOString(), "2026-10-08T23:30:00.000Z");
});
