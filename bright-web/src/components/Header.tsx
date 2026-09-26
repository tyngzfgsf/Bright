"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/app/auth";
import { useSiteNav, type Page } from "@/lib/site-nav";
import LocaleToggle from "./LocaleToggle";
import ThemeToggle from "./ThemeToggle";
import Wordmark from "./Wordmark";
import { GLIDE } from "@/lib/motion";
import { useScrollDirection } from "@/lib/useScrollDirection";
import { site } from "@/lib/site";

/** Every item is a page of this one-URL site; the first two are sections of the home page. */
const links: { to: Page; section?: string; key: "what" | "progress" | "download" | "releases" | "faq" }[] = [
  { to: "home", section: "what", key: "what" },
  { to: "home", section: "progress", key: "progress" },
  { to: "download", key: "download" },
  { to: "releases", key: "releases" },
  { to: "faq", key: "faq" },
];

export default function Header({ onSignIn }: { onSignIn: () => void }) {
  const t = useTranslations("nav");
  const { page, go } = useSiteNav();
  const { user, busy: authBusy } = useAuth();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const { direction, scrollY } = useScrollDirection();

  const scrolled = scrollY > 8;
  // Step out of the way on the way down, come back the moment you scroll up.
  // Never while the mobile menu is open, and never near the top of the page.
  const hidden = !open && direction === "down" && scrollY > 180;

  useEffect(() => setOpen(false), [page]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <motion.header
      animate={reduceMotion ? undefined : { y: hidden ? "-100%" : "0%" }}
      transition={GLIDE}
      className={[
        "sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-200",
        scrolled || open
          ? "border-b border-line-subtle bg-paper/72 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-paper/0",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <button
          type="button"
          onClick={() => go("home")}
          className="-m-2 rounded-full p-2 transition-opacity duration-200 hover:opacity-70"
          aria-label={site.name}
        >
          <Wordmark />
        </button>

        <nav
          onMouseLeave={() => setHovered(null)}
          className="hidden items-center lg:flex"
        >
          {links.map((link) => {
            const active = !link.section && page === link.to;
            const lit = hovered === link.key || (hovered === null && active);
            return (
              <button
                type="button"
                key={link.key}
                onClick={() => go(link.to, link.section)}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => setHovered(link.key)}
                className={[
                  "relative rounded-full px-3.5 py-2 text-[13.5px] transition-colors duration-200",
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
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Hidden until Firebase has said whether there's a session, so it never flickers
              from "Sign in" to nothing for a returning visitor. */}
          {!user && !authBusy && (
            <button
              type="button"
              onClick={onSignIn}
              className="hidden rounded-full px-3.5 py-2 text-[13.5px] text-ink-muted transition-colors duration-200 hover:text-ink sm:inline-flex"
            >
              {t("signIn")}
            </button>
          )}
          <button
            type="button"
            onClick={() => go("app")}
            className="hidden items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13.5px] font-semibold text-on-accent transition-colors duration-200 hover:bg-accent-hover sm:inline-flex"
          >
            {user && <Avatar name={user.name} photoURL={user.photoURL} />}
            {t("openApp")}
          </button>
          <LocaleToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("close") : t("menu")}
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition-colors duration-200 hover:border-line-strong hover:text-ink lg:hidden"
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
              <div className="my-3 flex gap-2 sm:hidden">
                {!user && !authBusy && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSignIn();
                    }}
                    className="flex flex-1 items-center justify-center rounded-full border border-line-strong py-3 text-[15px] font-medium text-ink"
                  >
                    {t("signIn")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    go("app");
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3 text-[15px] font-medium text-on-accent"
                >
                  {user && <Avatar name={user.name} photoURL={user.photoURL} />}
                  {t("openApp")}
                </button>
              </div>
              {links.map((link, i) => (
                <motion.div
                  key={link.key}
                  initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 + i * 0.035, duration: 0.3 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      go(link.to, link.section);
                    }}
                    className="flex w-full items-center justify-between border-b border-line-subtle py-3.5 text-[15px] text-ink-soft transition-colors duration-200 hover:text-ink"
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
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/** The signed-in account's picture, or its initial when there isn't one. */
function Avatar({ name, photoURL }: { name: string; photoURL: string | null }) {
  if (photoURL) {
    // eslint-disable-next-line @next/next/no-img-element -- a remote avatar in a static export
    return <img src={photoURL} alt="" referrerPolicy="no-referrer" className="size-5 rounded-full" />;
  }
  return (
    <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-paper/20 text-[11px] font-semibold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
