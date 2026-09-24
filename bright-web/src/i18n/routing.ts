export const locales = ["en", "ko"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Where the visitor's own KO/EN choice is kept. Only the manual toggle writes it, so a saved
 * choice always wins over detection on the next visit — auto-detection never masquerades as
 * a choice the visitor made.
 */
export const LOCALE_STORAGE_KEY = "bright-locale";

/** The cookie the old per-locale site wrote; still read so a returning visitor's choice holds. */
export const LEGACY_LOCALE_COOKIE = "NEXT_LOCALE";
