import type { AiRole, Difficulty, Language, TraineeRole } from "./prompt";
import { STORAGE, readJson, writeJson } from "./storage";

/** One turn on screen. `score`/`feedback` hang off the answer they grade. */
export type ChatMessage = {
  id: number;
  role: "ai" | "user";
  text: string;
  score?: number | null;
  feedback?: string | null;
};

/** What actually goes to the model — kept per session so a reopened session
    can carry on rather than being a dead transcript. */
export type ApiMessage = { role: "system" | "user" | "assistant"; content: string };

export type SessionConfig = {
  scenario: string;
  scenarioId: string | null;
  aiRole: AiRole;
  traineeRole: TraineeRole;
  difficulty: Difficulty;
  language: Language;
  /** Whether this session ran without a key. Fixed at start: a session that
      began scripted stays labelled scripted even after a key is added. */
  scripted: boolean;
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  config: SessionConfig;
  messages: ChatMessage[];
  history: ApiMessage[];
  scriptStep: number;
  complete: boolean;
  wrapUp: string | null;
};

export function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The scores given so far, and their mean to one decimal. */
export function averageScore(messages: ChatMessage[]): string {
  const scores = messages
    .map((m) => m.score)
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return "—";
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

export function loadSessions(): Session[] {
  const list = readJson<Session[]>(STORAGE.sessions, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s.id === "string" && Array.isArray(s.messages))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSessions(list: Session[]) {
  // Newest first, and capped: this is a demo, not an archive.
  writeJson(
    STORAGE.sessions,
    [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60),
  );
}

export type GroupKey = "today" | "yesterday" | "week" | "older";

/** Date buckets, the way every chat product's history rail does it. */
export function groupSessions(list: Session[]): { key: GroupKey; sessions: Session[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const today = startOfToday.getTime();

  const buckets: Record<GroupKey, Session[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const session of list) {
    const at = session.updatedAt;
    if (at >= today) buckets.today.push(session);
    else if (at >= today - dayMs) buckets.yesterday.push(session);
    else if (at >= today - 7 * dayMs) buckets.week.push(session);
    else buckets.older.push(session);
  }

  return (Object.keys(buckets) as GroupKey[])
    .map((key) => ({ key, sessions: buckets[key] }))
    .filter((group) => group.sessions.length > 0);
}
