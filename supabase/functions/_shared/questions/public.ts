// The only shape in which a question leaves the server before it is answered. Built field by field from an allow-list:
// correct_option_ids and explanation are not in the input type and could not be copied even by accident.
import type { Lang, QuestionCandidate } from "../types.ts";

export const PRACTICE_LABEL: Record<Lang, string> = {
  en: "Practice question. Check official guidelines.",
  ko: "연습 문제입니다. 공식 가이드라인을 확인하세요.",
};

export interface PublicQuestion {
  id: string;
  type: QuestionCandidate["type"];
  stem: string;
  options: { id: string; text: string }[];
  skill_tag: string;
  rubric_item_id: string;
  difficulty: number;
  language: Lang;
  label: string;
}

export function publicQuestion(q: QuestionCandidate): PublicQuestion {
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.options.map((o) => ({ id: String(o.id), text: String(o.text) })),
    skill_tag: q.skill_tag,
    rubric_item_id: q.rubric_item_id,
    difficulty: q.difficulty,
    language: q.language,
    label: PRACTICE_LABEL[q.language] ?? PRACTICE_LABEL.en,
  };
}

/** Exact-set comparison: every correct option picked and nothing else. */
export function isCorrect(selected: string[], correct: string[]): boolean {
  const want = new Set(correct);
  return selected.length === want.size && selected.every((s) => want.has(s));
}
