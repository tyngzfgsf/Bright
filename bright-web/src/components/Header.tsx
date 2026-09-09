"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import LocaleToggle from "./LocaleToggle";
import ThemeToggle from "./ThemeToggle";
import { site } from "@/lib/site";

const links = [
  { href: "#what", key: "what" },
  { href: "#how", key: "how" },
  { href: "#status", key: "status" },
] as const;

export default function Header() {
  const t = useTranslations("nav");
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={[
        "sticky top-0 z-50 backdrop-blur-xl transition-colors duration-300",
        scrolled
          ? "border-b border-line bg-paper/80"
          : "border-b border-transparent bg-paper/0",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <a
          href="#top"
          className="text-[15px] font-semibold tracking-[-0.01em] transition-opacity duration-200 hover:opacity-70"
        >
          {site.name}
        </a>

        <nav className="hidden items-center gap-7 text-[13.5px] text-ink-soft md:flex">
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="transition-colors duration-200 hover:text-ink"
            >
              {t(link.key)}
            </a>
          ))}
          <a
            href={site.releasesRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-200 hover:text-ink"
          >
            {t("github")}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("close") : t("menu")}
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition-colors duration-200 hover:text-ink md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 8h16M4 16h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line bg-paper/95 md:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-8">
              {links.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-line py-3.5 text-[15px] text-ink-soft transition-colors duration-200 last:border-0 hover:text-ink"
                >
                  {t(link.key)}
                </a>
              ))}
              <a
                href={site.releasesRepo}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="py-3.5 text-[15px] text-ink-soft transition-colors duration-200 hover:text-ink"
              >
                {t("github")}
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
