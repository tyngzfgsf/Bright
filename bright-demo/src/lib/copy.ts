import type { Language } from "./prompt";

/** UI strings for the demo. Small enough that a dictionary beats a library. */
export const COPY = {
  en: {
    // shell
    demoChip: "Demo",
    scriptedChip: "Scripted",
    liveChip: "Live",
    newSession: "New session",
    openSidebar: "Open sidebar",
    closeSidebar: "Close sidebar",
    noSessions: "Your sessions will show up here.",
    today: "Today",
    yesterday: "Yesterday",
    week: "Previous 7 days",
    older: "Older",
    deleteSession: "Delete session",
    untitled: "Untitled session",

    // account
    settings: "Settings",
    signIn: "Sign in",
    signOut: "Sign out",
    account: "Account",
    signedOut: "Not signed in",
    signedOutHint: "Sessions stay in this browser",
    signInTitle: "Sign in to Bright",
    signInBody:
      "Sign in to train with Bright's AI — no API key needed. You get 40 free turns a day. Your sessions still live in this browser.",
    continueWithGoogle: "Continue with Google",
    signInFailed: "That didn't go through. Try again.",
    signInRequired: "Sign in, or add your own Groq key in Settings, to run a live session.",
    quotaExceeded:
      "You've used today's 40 free turns. They reset at midnight UTC — or add your own Groq key in Settings to keep going.",
    continueWithout: "Keep going without an account",

    // welcome
    greeting: "What are we drilling today?",
    greetingSub:
      "The AI stays in character and asks one thing at a time. You answer in your own words, and every answer gets a mark out of ten.",
    welcomePlaceholder: "Describe the emergency you want to run…",
    pickOne: "Or start from one of these",
    surprise: "Surprise me",

    // session setup controls
    aiRole: "AI plays",
    traineeRole: "You are",
    difficulty: "Difficulty",
    language: "Language",
    endSession: "End session",

    // key
    key: "Groq key",
    keyBody:
      "Optional. With your own key, every turn goes to Groq on your quota and isn't counted against the daily free turns. The key stays in this browser and passes through Bright's proxy for each request — never stored, never logged.",
    keyPlaceholder: "gsk_…",
    keySave: "Save key",
    keySaved: "Saved",
    keyClear: "Remove key",
    keyGet: "Get a free key at console.groq.com",
    keyNoneSet: "No key set — sessions run on the scripted preview.",
    keySet: "A key is saved in this browser.",

    // settings sections
    settingsGeneral: "General",
    settingsDefaults: "Session defaults",
    settingsKey: "Groq key",
    settingsAccount: "Account",
    settingsData: "Data",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    defaultsNote: "What a new session starts with. Changing these leaves running sessions alone.",
    clearData: "Clear all sessions",
    clearDataBody: "Deletes every saved transcript in this browser. Your key is kept.",
    clearDataConfirm: "Delete them",
    close: "Close",

    // chill mode
    chill: "Chill mode",
    chillDevice: "Playing in this browser",
    chillPaused: "Paused",
    chillIdle: "Ready when you are",
    chillNote:
      "Ambient sound, made in this browser as it plays — no files, no account, nothing leaves the page.",
    play: "Play",
    pause: "Pause",
    prevTrack: "Previous",
    nextTrack: "Next",
    volume: "Volume",
    mute: "Mute",
    unmute: "Unmute",

    // transcript
    scriptedBanner:
      "Scripted preview — no key, so these replies are canned and nothing you type is being graded.",
    liveBanner: "Live — your answers are going to Groq and coming back graded.",
    thinking: "Thinking…",
    placeholder: "Type what you'd do or say…",
    send: "Send",
    scoreOf: "/10",
    again: "Run another session",
    error: "Something went wrong",
    streak: "Demo session",
    slogan: "A step for your brighter future",
    notTheApp:
      "A demo of the app in a browser. The real Bright is an Android app; sessions are saved in this browser only.",
  },
  ko: {
    // shell
    demoChip: "데모",
    scriptedChip: "스크립트",
    liveChip: "실행 중",
    newSession: "새 세션",
    openSidebar: "사이드바 열기",
    closeSidebar: "사이드바 닫기",
    noSessions: "여기에 세션이 쌓입니다.",
    today: "오늘",
    yesterday: "어제",
    week: "지난 7일",
    older: "이전",
    deleteSession: "세션 삭제",
    untitled: "제목 없는 세션",

    // account
    settings: "설정",
    signIn: "로그인",
    signOut: "로그아웃",
    account: "계정",
    signedOut: "로그인하지 않음",
    signedOutHint: "세션은 이 브라우저에만 남습니다",
    signInTitle: "Bright 로그인",
    signInBody:
      "로그인하면 API 키 없이 Bright의 AI로 훈련할 수 있습니다. 하루 40턴까지 무료입니다. 세션 기록은 계속 이 브라우저에 저장됩니다.",
    continueWithGoogle: "Google로 계속하기",
    signInFailed: "로그인하지 못했습니다. 다시 시도해 주세요.",
    signInRequired: "라이브 세션을 하려면 로그인하거나 설정에서 본인 Groq 키를 추가하세요.",
    quotaExceeded:
      "오늘의 무료 40턴을 모두 사용했습니다. UTC 자정에 초기화되며, 설정에서 본인 Groq 키를 추가하면 바로 계속할 수 있습니다.",
    continueWithout: "계정 없이 계속하기",

    // welcome
    greeting: "오늘은 무엇을 훈련할까요?",
    greetingSub:
      "AI가 배역을 유지한 채 한 번에 하나씩 묻습니다. 답은 직접 적고, 답마다 10점 만점으로 점수가 붙습니다.",
    welcomePlaceholder: "훈련하고 싶은 응급 상황을 적어 보세요…",
    pickOne: "또는 아래에서 고르세요",
    surprise: "아무거나",

    // session setup controls
    aiRole: "AI 역할",
    traineeRole: "내 역할",
    difficulty: "난이도",
    language: "언어",
    endSession: "세션 종료",

    // key
    key: "Groq 키",
    keyBody:
      "선택 사항입니다. 본인 키를 쓰면 각 턴이 본인 할당량으로 Groq에 전송되고, 하루 무료 턴에서 차감되지 않습니다. 키는 이 브라우저에만 저장되며 요청할 때마다 Bright 프록시를 거칠 뿐 저장되거나 기록되지 않습니다.",
    keyPlaceholder: "gsk_…",
    keySave: "키 저장",
    keySaved: "저장됨",
    keyClear: "키 삭제",
    keyGet: "console.groq.com에서 무료 키 받기",
    keyNoneSet: "키가 없어 스크립트 미리보기로 실행됩니다.",
    keySet: "이 브라우저에 키가 저장되어 있습니다.",

    // settings sections
    settingsGeneral: "일반",
    settingsDefaults: "세션 기본값",
    settingsKey: "Groq 키",
    settingsAccount: "계정",
    settingsData: "데이터",
    theme: "테마",
    themeSystem: "시스템",
    themeLight: "라이트",
    themeDark: "다크",
    defaultsNote: "새 세션이 시작할 때 쓰는 값입니다. 진행 중인 세션은 그대로 둡니다.",
    clearData: "모든 세션 삭제",
    clearDataBody: "이 브라우저에 저장된 대화를 모두 지웁니다. 키는 남습니다.",
    clearDataConfirm: "삭제",
    close: "닫기",

    // chill mode
    chill: "칠 모드",
    chillDevice: "이 브라우저에서 재생 중",
    chillPaused: "일시정지",
    chillIdle: "언제든 시작하세요",
    chillNote:
      "재생하는 동안 이 브라우저가 직접 만들어 내는 앰비언트 사운드입니다. 파일도 계정도 없고, 페이지 밖으로 나가는 것도 없습니다.",
    play: "재생",
    pause: "일시정지",
    prevTrack: "이전 곡",
    nextTrack: "다음 곡",
    volume: "볼륨",
    mute: "음소거",
    unmute: "음소거 해제",

    // transcript
    scriptedBanner:
      "스크립트 미리보기 — 키가 없어서 미리 적어 둔 답변이 나오고, 입력한 내용은 채점되지 않습니다.",
    liveBanner: "실제 실행 중 — 입력한 답이 Groq로 가서 채점되어 돌아옵니다.",
    thinking: "생각하는 중…",
    placeholder: "할 말이나 처치를 입력하세요…",
    send: "보내기",
    scoreOf: "/10",
    again: "한 번 더",
    error: "문제가 생겼습니다",
    streak: "데모 세션",
    slogan: "더 밝은 미래를 위한 한 걸음",
    notTheApp:
      "브라우저에서 돌아가는 앱 데모입니다. 실제 Bright는 안드로이드 앱이고, 세션은 이 브라우저에만 저장됩니다.",
  },
} satisfies Record<Language, Record<string, string>>;

export type Copy = (typeof COPY)["en"];
