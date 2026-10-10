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
import { useSiteNav } from "@/lib/site-nav";

export type Theme = "system" | "light" | "dark";

/** Everything Settings can change. The Groq key lives on its own storage key
    so it can be cleared without touching the rest. `language` is the site's own
    language (see `lib/site-nav.tsx`): changing it in the app's Settings changes
    the whole site, and the site's KO/EN toggle changes the app. */
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

/** The site keeps theme as a `.dark` class on <html> (see the home page's ThemeToggle), so
    "system" resolves to whatever the OS prefers right now.
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

  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
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

  const { locale, setLocale } = useSiteNav();

  const set = useCallback((patch: Partial<Prefs>) => {
    if (patch.language) setLocale(patch.language);
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeJson(STORAGE.prefs, next);
      if (patch.theme && patch.theme !== current.theme) {
        writeRaw(STORAGE.theme, patch.theme);
        applyTheme(patch.theme, true);
      }
      return next;
    });
  }, [setLocale]);

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed);
    writeRaw(STORAGE.key, trimmed || null);
  }, []);

  const value = useMemo<PrefsValue>(
    () => ({ ...prefs, language: locale, apiKey, ready, set, setApiKey }),
    [prefs, locale, apiKey, ready, set, setApiKey],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return value;
}
