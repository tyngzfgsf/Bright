/**
 * hreflang set for one route. Page metadata replaces the layout's `alternates`
 * wholesale, so every page builds its own rather than inheriting a home-page one.
 */
export function localeAlternates(path = "") {
  return {
    canonical: undefined as string | undefined,
    languages: {
      en: `/en${path}`,
      ko: `/ko${path}`,
      "x-default": `/en${path}`,
    },
  };
}

export function alternatesFor(locale: string, path = "") {
  return {
    ...localeAlternates(path),
    canonical: `/${locale}${path}`,
  };
}
