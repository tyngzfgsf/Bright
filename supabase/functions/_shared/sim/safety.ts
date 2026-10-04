// Output safety for the narrator, and a lint for scenario text. The narration PROMPT forbids inventing
// treatments, doses and numbers; this is the code-level backstop for when a model ignores the prompt.

// "0.3 mg", "5 mL", "2 units" ... a number followed by a dosing unit. Unit match is deliberately not
// bounded to known drugs: any dose-shaped phrase is out.
const DOSE_UNIT = /\d(?:[.,]\d+)?\s*(?:mg|mcg|µg|μg|ug|kg|g|ml|cc|l|iu|units?|meq|mmol|㎎|㎖|밀리그램|마이크로그램|그램|밀리리터|단위|유닛)(?![a-z])/i;
const DOSE_WORD = /\b(?:milligrams?|micrograms?|milliliters?|millilitres?|ampou?les?)\b/i;
const LINK = /https?:\/\/|www\./i;
const NUMBER = /\d+(?:[.,]\d+)?/g;

export const MAX_REPLY_CHARS = 700;

export function hasDose(text: string): boolean {
  return DOSE_UNIT.test(text) || DOSE_WORD.test(text);
}

export function numbersIn(text: string): string[] {
  return text.match(NUMBER) ?? [];
}

export type NarrationVerdict = { ok: true; text: string } | { ok: false; reason: "empty" | "dose" | "number" | "link" };

/**
 * `allowedNumbers`: the only numbers the reply may contain (vitals from the state, elapsed minutes, numbers
 * in the persona). Anything else, any dose-shaped phrase, and any link is rejected; the caller then shows the
 * scenario's fixed fallback line instead. The state change is unaffected: it was decided by code before narration.
 */
export function checkNarration(raw: string, allowedNumbers: ReadonlySet<string>): NarrationVerdict {
  const text = raw.trim().slice(0, MAX_REPLY_CHARS);
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (LINK.test(text)) return { ok: false, reason: "link" };
  if (hasDose(text)) return { ok: false, reason: "dose" };
  if (numbersIn(text).some((n) => !allowedNumbers.has(n))) return { ok: false, reason: "number" };
  return { ok: true, text };
}
