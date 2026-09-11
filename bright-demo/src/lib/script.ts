import type { Language, TurnResult } from "./prompt";

/**
 * The canned walkthrough used when no Groq key is entered.
 *
 * These replies are written by hand, not generated, and the scores are fixed —
 * nothing here reads what you typed. The UI says so plainly while this is
 * running; it exists so the demo can be shown without a key, not to imitate
 * the grader.
 */
const SCRIPT: Record<Language, TurnResult[]> = {
  en: [
    {
      score: null,
      feedback: null,
      next_prompt:
        "62-year-old man, brought in by his wife. He's grey, sweating, and holding his chest. It started about twenty minutes ago. What do you want first?",
      session_complete: false,
    },
    {
      score: 8,
      feedback:
        "Vitals and a 12-lead first is right, and asking for IV access early saves you time later. You didn't mention oxygen saturation, which decides whether he needs any.",
      next_prompt:
        "BP 138/86, HR 102, sats 96% on air. The ECG shows ST elevation in II, III and aVF. What's your read, and what happens next?",
      session_complete: false,
    },
    {
      score: 9,
      feedback:
        "Inferior STEMI is correct and activating the cath lab is the priority call. Good instinct asking for a right-sided ECG — that's what catches RV involvement.",
      next_prompt:
        "Right-sided leads show V4R elevation. His BP drops to 88/54. The nurse is holding a GTN spray and looking at you. What do you say?",
      session_complete: false,
    },
    {
      score: 7,
      feedback:
        "Holding the nitrate is the answer — an RV infarct is preload-dependent and GTN can drop him further. You'd want a fluid bolus alongside that, which you didn't say.",
      next_prompt:
        "You give 250ml of saline and his pressure comes up to 102/62. The cath lab is ready in four minutes. Anything else before he goes?",
      session_complete: false,
    },
  ],
  ko: [
    {
      score: null,
      feedback: null,
      next_prompt:
        "62세 남성이 부인과 함께 들어왔습니다. 얼굴이 창백하고 식은땀을 흘리며 가슴을 붙잡고 있습니다. 20분쯤 전에 시작됐다고 합니다. 먼저 무엇을 하시겠습니까?",
      session_complete: false,
    },
    {
      score: 8,
      feedback:
        "활력징후와 12유도 심전도를 먼저 본 것은 맞습니다. 정맥로를 일찍 확보한 것도 좋습니다. 다만 산소포화도를 언급하지 않으셨는데, 산소 투여 여부가 여기서 갈립니다.",
      next_prompt:
        "혈압 138/86, 맥박 102회, 실내 공기에서 산소포화도 96%입니다. 심전도에서 II, III, aVF 유도에 ST 상승이 보입니다. 어떻게 판단하시고, 다음은 무엇입니까?",
      session_complete: false,
    },
    {
      score: 9,
      feedback:
        "하벽 STEMI 판단이 정확하고, 심혈관조영실을 부르는 것이 최우선입니다. 우측 유도 심전도를 확인하자고 한 것도 좋았습니다. 우심실 침범은 그걸로 잡습니다.",
      next_prompt:
        "우측 유도에서 V4R 상승이 확인됩니다. 혈압이 88/54로 떨어집니다. 간호사가 니트로글리세린 스프레이를 들고 선생님을 봅니다. 뭐라고 하시겠습니까?",
      session_complete: false,
    },
    {
      score: 7,
      feedback:
        "질산염을 보류한 것이 정답입니다. 우심실 경색은 전부하 의존적이라 니트로글리세린으로 혈압이 더 떨어질 수 있습니다. 다만 수액 볼루스를 함께 말씀하셨어야 합니다.",
      next_prompt:
        "생리식염수 250ml를 투여하자 혈압이 102/62로 올라옵니다. 심혈관조영실은 4분 뒤 준비됩니다. 보내기 전에 더 하실 것이 있습니까?",
      session_complete: false,
    },
  ],
};

const WRAP_UP: Record<Language, TurnResult> = {
  en: {
    score: 8,
    feedback:
      "Solid close — you kept the priorities in order under time pressure.",
    next_prompt:
      "Across the session your recognition was quick and your reasoning about the right ventricle was the strongest part. What to work on: say the things you're assuming out loud — oxygen, fluids, analgesia — because in a real resus nobody hears what you didn't say. One takeaway: in inferior STEMI, get right-sided leads before anyone reaches for a nitrate.",
    session_complete: true,
  },
  ko: {
    score: 8,
    feedback: "마무리가 좋았습니다. 시간 압박 속에서도 우선순위를 지켰습니다.",
    next_prompt:
      "이번 세션에서 인지 속도가 빨랐고, 우심실에 대한 판단이 가장 좋았습니다. 보완할 점은 머릿속으로 전제하고 있는 것들을 말로 내는 습관입니다. 산소, 수액, 진통 같은 것들은 실제 소생 현장에서 말하지 않으면 아무도 모릅니다. 한 가지만 기억하신다면, 하벽 STEMI에서는 누가 질산염에 손대기 전에 우측 유도를 먼저 확인하십시오.",
    session_complete: true,
  },
};

export function scriptedTurn(language: Language, index: number): TurnResult {
  const turns = SCRIPT[language];
  return turns[Math.min(index, turns.length - 1)];
}

export function scriptedWrapUp(language: Language): TurnResult {
  return WRAP_UP[language];
}

export const SCRIPTED_SCENARIO: Record<Language, string> = {
  en: "Chest pain, 62",
  ko: "62세 남성, 흉통",
};
