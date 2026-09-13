"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AiRole, Difficulty, Language, TraineeRole } from "./prompt";
import { STORAGE, readJson, readRaw, writeJson, writeRaw } from "./storage";

export type Theme = "system" | "light" | "dark";

/** Everything Settings can change. The Groq key lives on its own storage key
    so it can be cleared without touching the rest. */
export type Prefs = {
  language: Language;
  theme: Theme;
  aiRole: AiRole;
  traineeRole: TraineeRole;
  difficulty: Difficulty;
};

const DEFAULTS: Prefs = {
  language: "en",
  theme: "system",
  aiRole: "patient",
  traineeRole: "doctor",
  difficulty: "intermediate",
};

type PrefsValue = Prefs & {
  apiKey: string;
  /** False until localStorage has been read, so the first paint can stay
      neutral instead of flashing the default and then the saved value. */
  ready: boolean;
  set: (patch: Partial<Prefs>) => void;
  setApiKey: (key: string) => void;
};

const PrefsContext = createContext<PrefsValue | null>(null);

let swapTimer: number | undefined;

/** Puts the override class on <html>; no class at all means "follow the
    system", which globals.css already handles.
    `animate` adds `.theme-anim` for one beat so every surface cross-fades
    instead of snapping — it comes straight off again so it never slows a
    hover. The first application, on load, isn't animated: there is nothing
    to cross-fade from. */
function applyTheme(theme: Theme, animate = false) {
  const root = document.documentElement;

  if (animate) {
    root.classList.add("theme-anim");
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => root.classList.remove("theme-anim"), 460);
  }

  root.classList.remove("light", "dark");
  if (theme !== "system") root.classList.add(theme);
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [apiKey, setApiKeyState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readJson<Partial<Prefs>>(STORAGE.prefs, {});
    const theme = (readRaw(STORAGE.theme) as Theme | null) ?? saved.theme ?? "system";
    const merged: Prefs = { ...DEFAULTS, ...saved, theme };
    setPrefs(merged);
    setApiKeyState(readRaw(STORAGE.key) ?? "");
    applyTheme(merged.theme);
    setReady(true);
  }, []);

  // The <html lang> drives the Korean font stack and letter-spacing rules.
  useEffect(() => {
    document.documentElement.lang = prefs.language;
  }, [prefs.language]);

  const set = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeJson(STORAGE.prefs, next);
      if (patch.theme && patch.theme !== current.theme) {
        writeRaw(STORAGE.theme, patch.theme);
        applyTheme(patch.theme, true);
      }
      return next;
    });
  }, []);

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed);
    writeRaw(STORAGE.key, trimmed || null);
  }, []);

  const value = useMemo<PrefsValue>(
    () => ({ ...prefs, apiKey, ready, set, setApiKey }),
    [prefs, apiKey, ready, set, setApiKey],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return value;
}
