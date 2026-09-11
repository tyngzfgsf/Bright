import type { Difficulty, Language, TraineeRole, AiRole } from "./prompt";

/**
 * The same ten emergencies the app offers, with the labels taken from its
 * strings.xml in both languages. The app also lets you type your own, so this
 * demo does too.
 */
export const SCENARIOS = [
  { id: "cardiac_arrest", en: "Cardiac arrest", ko: "심정지" },
  { id: "anaphylaxis", en: "Anaphylaxis", ko: "아나필락시스" },
  { id: "stroke", en: "Stroke", ko: "뇌졸중" },
  { id: "trauma", en: "Trauma / bleeding", ko: "외상 / 출혈" },
  { id: "choking", en: "Choking", ko: "기도 폐쇄" },
  { id: "seizure", en: "Seizure", ko: "발작" },
  { id: "diabetic", en: "Diabetic emergency", ko: "당뇨 응급 상황" },
  { id: "asthma", en: "Asthma attack", ko: "천식 발작" },
  { id: "sepsis", en: "Sepsis", ko: "패혈증" },
  { id: "burns", en: "Burns", ko: "화상" },
] as const;

export const DIFFICULTIES: { id: Difficulty; en: string; ko: string }[] = [
  { id: "beginner", en: "Beginner", ko: "초급" },
  { id: "intermediate", en: "Intermediate", ko: "중급" },
  { id: "advanced", en: "Advanced", ko: "고급" },
];

export const TRAINEE_ROLES: { id: TraineeRole; en: string; ko: string }[] = [
  { id: "doctor", en: "Doctor", ko: "의사" },
  { id: "nurse", en: "Nurse", ko: "간호사" },
  { id: "emt", en: "EMT / paramedic", ko: "응급구조사" },
];

export const AI_ROLES: { id: AiRole; en: string; ko: string }[] = [
  { id: "patient", en: "The patient", ko: "환자" },
  { id: "doctor", en: "A doctor quizzing you", ko: "질문하는 의사" },
];

export function scenarioLabel(id: string, language: Language): string {
  const found = SCENARIOS.find((s) => s.id === id);
  return found ? found[language] : id;
}

export function randomScenario() {
  return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
}
