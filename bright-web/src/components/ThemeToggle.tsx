"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { THEME_STORAGE_KEY } from "@/lib/site";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function currentTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return systemTheme();
}

export default function ThemeToggle() {
  const t = useTranslations("theme");
  const reduceMotion = useReducedMotion();
  const [theme, setTheme] = useState<Theme | null>(null);
  const animTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setTheme(currentTheme());

    // Keep following the system while the visitor hasn't chosen a side.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const root = document.documentElement;
      if (!root.classList.contains("dark") && !root.classList.contains("light")) {
        setTheme(systemTheme());
      }
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      window.clearTimeout(animTimer.current);
    };
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    const root = document.documentElement;

    // Cross-fade the surfaces instead of snapping. The class carries the
    // transition and is removed straight after, so it never affects hovers.
    root.classList.add("theme-anim");
    window.clearTimeout(animTimer.current);
    animTimer.current = window.setTimeout(
      () => root.classList.remove("theme-anim"),
      460,
    );

    root.classList.remove("light", "dark");
    root.classList.add(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the in-page toggle still works for this visit.
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t("toLight") : t("toDark")}
      title={t("label")}
      className="grid size-9 place-items-center overflow-hidden rounded-full border border-line text-ink-soft transition-colors duration-300 hover:border-line-strong hover:text-ink"
    >
      {/* Swapped in place rather than through AnimatePresence: an exit
          animation would leave the button empty while the icon changes. */}
      <motion.span
        key={theme ?? "unset"}
        initial={reduceMotion ? false : { rotate: -30, scale: 0.7, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="grid place-items-center"
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </motion.span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
    </svg>
  );
}
