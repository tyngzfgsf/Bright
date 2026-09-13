/**
 * Every key this demo puts in localStorage, in one place, plus readers that
 * never throw. Storage is blocked outright in some browsers and in private
 * windows; when that happens the app should quietly run without memory rather
 * than fail to mount.
 */

export const STORAGE = {
  key: "bright-demo-groq-key",
  prefs: "bright-demo-prefs",
  theme: "bright-demo-theme",
  sessions: "bright-demo-sessions",
  chill: "bright-demo-chill",
} as const;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Non-fatal: the value still holds for this tab, it just won't come back.
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    // Circular or oversized payloads: drop the write, keep the session alive.
  }
}
