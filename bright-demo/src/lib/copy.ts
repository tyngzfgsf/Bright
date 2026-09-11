import type { Language } from "./prompt";

/** UI strings for the demo. Small enough that a dictionary beats a library. */
export const COPY = {
  en: {
    demoChip: "Web demo",
    setupTitle: "Set up a session",
    setupLede:
      "Same drill as the app: the AI stays in character and asks one thing at a time, you answer in your own words, and each answer gets a mark out of ten.",
    scenario: "Emergency",
    ownScenario: "Or describe your own scenario…",
    surprise: "Surprise me",
    aiRole: "The AI plays",
    traineeRole: "You are",
    difficulty: "Difficulty",
    language: "Language",
    start: "Start the session",
    key: "Groq key",
    keyTitle: "Your Groq API key",
    keyBody:
      "The demo sends each turn to Groq using your key, exactly as the app does. It's kept in this browser and passed through this machine's own server route for the request — never stored on a server, never logged.",
    keyPlaceholder: "gsk_…",
    keySave: "Save key",
    keyClear: "Remove key",
    keyGet: "Get a free key at console.groq.com",
    scriptedBanner:
      "Scripted preview — no key, so these replies are canned and nothing you type is being graded.",
    liveBanner: "Live — your answers are going to Groq and coming back graded.",
    endSession: "End session",
    thinking: "Thinking…",
    placeholder: "Type what you'd do or say…",
    send: "Send",
    scoreOf: "/10",
    sessionScore: "Session average",
    wrapUp: "Wrap-up",
    again: "Run another session",
    error: "Something went wrong",
    retry: "Try again",
    streak: "Demo session",
    slogan: "A step for your brighter future",
    notTheApp:
      "A demo of the app in a browser. The real Bright is an Android app; nothing here is saved when you close the tab.",
  },
  ko: {
    demoChip: "웹 데모",
    setupTitle: "세션 설정",
    setupLede:
      "앱과 같은 방식입니다. AI가 배역을 유지한 채 한 번에 하나씩 묻고, 답은 직접 적고, 답마다 10점 만점으로 점수가 붙습니다.",
    scenario: "상황",
    ownScenario: "또는 직접 시나리오 입력…",
    surprise: "아무거나",
    aiRole: "AI 역할",
    traineeRole: "내 역할",
    difficulty: "난이도",
    language: "언어",
    start: "세션 시작",
    key: "Groq 키",
    keyTitle: "Groq API 키",
    keyBody:
      "앱과 똑같이, 각 턴을 사용자의 키로 Groq에 보냅니다. 키는 이 브라우저에 저장되고 요청은 이 컴퓨터의 서버 경로를 거칩니다. 서버에 저장되거나 기록되지 않습니다.",
    keyPlaceholder: "gsk_…",
    keySave: "키 저장",
    keyClear: "키 삭제",
    keyGet: "console.groq.com에서 무료 키 받기",
    scriptedBanner:
      "스크립트 미리보기 — 키가 없어서 미리 적어 둔 답변이 나오고, 입력한 내용은 채점되지 않습니다.",
    liveBanner: "실제 실행 중 — 입력한 답이 Groq로 가서 채점되어 돌아옵니다.",
    endSession: "세션 종료",
    thinking: "생각하는 중…",
    placeholder: "할 말이나 처치를 입력하세요…",
    send: "보내기",
    scoreOf: "/10",
    sessionScore: "세션 평균",
    wrapUp: "총평",
    again: "한 번 더",
    error: "문제가 생겼습니다",
    retry: "다시 시도",
    streak: "데모 세션",
    slogan: "더 밝은 미래를 위한 한 걸음",
    notTheApp:
      "브라우저에서 돌아가는 앱 데모입니다. 실제 Bright는 안드로이드 앱이고, 여기서 한 것은 탭을 닫으면 남지 않습니다.",
  },
} satisfies Record<Language, Record<string, string>>;

export type Copy = (typeof COPY)["en"];
