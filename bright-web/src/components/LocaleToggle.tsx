"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { locales } from "@/i18n/routing";
import { GLIDE } from "@/lib/motion";
import { useSiteNav } from "@/lib/site-nav";

export default function LocaleToggle() {
  const t = useTranslations("lang");
  // Switching language re-renders the page you're on in place — same page, same URL. The
  // manual choice is the only thing persisted, so it always wins on the next visit.
  const { locale: active, setLocale: choose } = useSiteNav();
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex items-center rounded-full border border-line p-0.5 text-[11px] font-medium tracking-[0.02em] transition-colors duration-300"
    >
      {locales.map((locale) => {
        const selected = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => choose(locale)}
            aria-pressed={selected}
            aria-label={t(locale === "en" ? "enFull" : "koFull")}
            className={[
              "relative rounded-full px-2.5 py-1 transition-colors duration-300",
              selected ? "text-paper" : "text-ink-faint hover:text-ink",
            ].join(" ")}
          >
            {selected && (
              <motion.span
                layoutId="locale-pill"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-ink"
                transition={reduceMotion ? { duration: 0 } : GLIDE}
              />
            )}
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}
