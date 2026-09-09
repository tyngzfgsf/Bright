"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/routing";

const ONE_YEAR = 60 * 60 * 24 * 365;

export default function LocaleToggle() {
  const t = useTranslations("lang");
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
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
      className="flex items-center rounded-full border border-line p-0.5 text-[11px] font-medium tracking-wide"
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
              "rounded-full px-2.5 py-1 transition-all duration-200",
              selected
                ? "bg-ink text-paper"
                : "text-ink-faint hover:text-ink",
            ].join(" ")}
          >
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}
