"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, usePathname } from "@/i18n/navigation";
import LocaleToggle from "./LocaleToggle";
import ThemeToggle from "./ThemeToggle";
import Wordmark from "./Wordmark";
import { GLIDE } from "@/lib/motion";
import { site } from "@/lib/site";

/** Anchors only resolve on the home page, so they're written as absolute paths. */
const links = [
  { href: "/#what", key: "what" },
  { href: "/#how", key: "how" },
  { href: "/download", key: "download" },
  { href: "/releases", key: "releases" },
  { href: "/faq", key: "faq" },
] as const;

export default function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={[
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500",
        scrolled || open
          ? "border-b border-line-subtle bg-paper/72 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-paper/0",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="-m-2 rounded-full p-2 transition-opacity duration-300 hover:opacity-70"
          aria-label={site.name}
        >
          <Wordmark />
        </Link>

        <nav
          onMouseLeave={() => setHovered(null)}
          className="hidden items-center lg:flex"
        >
          {links.map((link) => {
            const active = pathname === link.href;
            const lit = hovered === link.key || (hovered === null && active);
            return (
              <Link
                key={link.key}
                href={link.href}
                onMouseEnter={() => setHovered(link.key)}
                className={[
                  "relative rounded-full px-3.5 py-2 text-[13.5px] transition-colors duration-300",
                  active || hovered === link.key ? "text-ink" : "text-ink-muted",
                ].join(" ")}
              >
                {lit && (
                  <motion.span
                    layoutId="nav-pill"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 rounded-full bg-raised ring-1 ring-line-subtle"
                    transition={reduceMotion ? { duration: 0 } : GLIDE}
                  />
                )}
                {t(link.key)}
              </Link>
            );
          })}
          <a
            href={site.releasesRepo}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setHovered(null)}
            className="ml-1.5 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] text-ink-muted transition-colors duration-300 hover:text-ink"
          >
            {t("github")}
            <svg
              viewBox="0 0 24 24"
              className="size-[13px] opacity-60"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 16 16 8M9.5 8H16v6.5" />
            </svg>
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
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition-colors duration-300 hover:border-line-strong hover:text-ink lg:hidden"
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
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line-subtle bg-paper/95 lg:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-col px-5 py-1 sm:px-8">
              {links.map((link, i) => (
                <motion.div
                  key={link.key}
                  initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 + i * 0.035, duration: 0.3 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between border-b border-line-subtle py-3.5 text-[15px] text-ink-soft transition-colors duration-200 hover:text-ink"
                  >
                    {t(link.key)}
                    <svg
                      viewBox="0 0 24 24"
                      className="size-[15px] text-ink-faint"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9.5 6l6 6-6 6" />
                    </svg>
                  </Link>
                </motion.div>
              ))}
              <a
                href={site.releasesRepo}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between py-3.5 text-[15px] text-ink-soft transition-colors duration-200 hover:text-ink"
              >
                {t("github")}
                <svg
                  viewBox="0 0 24 24"
                  className="size-[15px] text-ink-faint"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 16 16 8M9.5 8H16v6.5" />
                </svg>
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
