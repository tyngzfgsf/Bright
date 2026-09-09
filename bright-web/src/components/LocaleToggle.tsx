"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/routing";
import { GLIDE } from "@/lib/motion";

const ONE_YEAR = 60 * 60 * 24 * 365;

export default function LocaleToggle() {
  const t = useTranslations("lang");
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === active) return;
    // A manual choice is the only thing that gets persisted — auto-detection
    // never writes this cookie, so this always wins on the next visit.
    document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${ONE_YEAR};samesite=lax`;
    startTransition(() => {
      router.replace(pathname, { locale });
    });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      data-pending={isPending ? "" : undefined}
      className="flex items-center rounded-full border border-line p-0.5 text-[11px] font-medium tracking-[0.02em] transition-colors duration-300 data-pending:opacity-70"
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
