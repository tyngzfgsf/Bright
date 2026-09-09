import { defineRouting } from "next-intl/routing";

export const locales = ["en", "ko"] as const;
export type Locale = (typeof locales)[number];

/** Cookie the manual KO/EN toggle writes, so a visitor's choice sticks on return. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  // Detection is handled explicitly in `src/middleware.ts` so we can fall back to
  // IP geolocation before defaulting.
  localeDetection: false,
});
