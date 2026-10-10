/**
 * A TypeScript port of the app's `ScenarioPromptBuilder` (Kotlin, in
 * `shared/src/commonMain/.../domain/ScenarioPromptBuilder.kt`), so this demo
 * drives the model with the same contract the Android app does: one focused
 * question per turn, and a strict JSON reply carrying the grade.
 *
 * Keep the two in step — if the app's prompt changes, this should follow.
 */

export type Language = "en" | "ko";
export type TraineeRole = "doctor" | "nurse" | "emt";
export type AiRole = "patient" | "doctor";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export const TRAINEE_LABEL: Record<TraineeRole, string> = {
  doctor: "doctor",
  nurse: "nurse",
  emt: "EMT/paramedic",
};

export const AI_LABEL: Record<AiRole, string> = {
  patient: "the patient",
  doctor: "a supervising doctor/examiner quizzing the trainee directly",
};

export const DIFFICULTY_INSTRUCTION: Record<Difficulty, string> = {
  beginner:
    "Keep the case straightforward: classic, textbook presentation, minimal complications, and forgiving pacing.",
  intermediate:
    "Give the case some realistic ambiguity and one moderate complication partway through.",
  advanced:
    "Make the case demanding: atypical presentation, tight timing, and at least one significant complication or curveball.",
};

export const END_SESSION_MARKER = "[END_SESSION]";

export function buildSystemPrompt(options: {
  scenarioDescription: string;
  aiRole: AiRole;
  traineeRole: TraineeRole;
  difficulty: Difficulty;
  language: Language;
}): string {
  const languageInstruction =
    options.language === "ko"
      ? 'The values of "feedback" and "next_prompt" must be written in natural, conversational Korean (한국어), regardless of what language the trainee uses.'
      : 'The values of "feedback" and "next_prompt" must be written in natural, conversational English, regardless of what language the trainee uses.';

  return `You are the question engine for "Bright", a medical emergency training app. You run a
focused question-and-answer drill for a trainee ${TRAINEE_LABEL[options.traineeRole]}, staying in
character as ${AI_LABEL[options.aiRole]} throughout.

SCENARIO: ${options.scenarioDescription}. Invent realistic, specific, internally consistent
details as needed (vitals, history, setting), but reveal them through your questions —
never dump the whole case at once.

DIFFICULTY: ${DIFFICULTY_INSTRUCTION[options.difficulty]}

FORMAT — THIS IS CRITICAL: This is a drill, not a story. Every single one of your turns
must be ONE focused question or situation for the trainee to respond to — never a long
narrative, never multiple questions bundled together. After the trainee answers, you
immediately grade that specific answer and move to the next question. Do not let the
scenario meander; keep it tight and quiz-like.

You must respond with ONLY a single valid JSON object, no other text, no markdown code
fences, matching exactly this shape:
{
  "score": <integer 0-10, or null if there is no prior answer to grade yet>,
  "feedback": "<1-2 sentences on what was right or missed in the trainee's last answer, or null on the very first turn>",
  "next_prompt": "<the next single focused question or situation, in character>",
  "session_complete": <true only when told to end the session, false otherwise>
}

GRADING: Score 0-10 based on clinical accuracy and appropriateness of the trainee's
answer to the specific question just asked. Be honest and specific in "feedback" —
name what was correct and what was missing, don't just say "good job".

ENDING: If a message begins with "${END_SESSION_MARKER}", set "session_complete": true, set
"next_prompt" to a short overall wrap-up (2-3 sentences: what the trainee did well
across the session, what to work on, one concrete takeaway), and still grade the
trainee's final answer normally if one was given in this same turn.

${languageInstruction}`;
}

export function openingPrompt(language: Language): string {
  return language === "ko"
    ? "세션을 시작하세요. 첫 번째 문제를 내주세요."
    : "Begin the session. Ask the first question.";
}

export function endSessionPrompt(language: Language): string {
  return language === "ko"
    ? `${END_SESSION_MARKER} 훈련생이 세션을 종료하려고 합니다. session_complete를 true로 설정하고 전체 세션에 대한 마무리 피드백을 next_prompt에 담아 주세요.`
    : `${END_SESSION_MARKER} The trainee is ending the session. Set session_complete to true and put an overall wrap-up in next_prompt.`;
}

/** The shape the model is told to return. */
export type TurnResult = {
  score: number | null;
  feedback: string | null;
  next_prompt: string;
  session_complete: boolean;
};
