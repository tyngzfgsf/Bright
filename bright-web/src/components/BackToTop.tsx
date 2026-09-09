"use client";

import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PRESS } from "@/lib/motion";
import { useScrollDirection } from "@/lib/useScrollDirection";

/**
 * Appears once you're well down the page and you start heading back up — the
 * point at which you actually want it — and gets out of the way otherwise.
 */
export default function BackToTop() {
  const t = useTranslations("nav");
  const reduceMotion = useReducedMotion();
  const { direction, scrollY } = useScrollDirection();

  const visible = scrollY > 900 && direction === "up";

  function toTop() {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={toTop}
          aria-label={t("backToTop")}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.9 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          transition={PRESS}
          className="fixed bottom-6 right-5 z-40 grid size-11 place-items-center rounded-full border border-line bg-paper/80 text-ink-soft shadow-raise backdrop-blur-xl transition-colors duration-300 hover:border-line-strong hover:text-ink sm:bottom-8 sm:right-8"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-[17px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V6M6 12l6-6 6 6" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
