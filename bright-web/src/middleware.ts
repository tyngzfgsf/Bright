import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, locales, routing, type Locale } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * Highest-priority locale we support from an Accept-Language header.
 * Returns null when the visitor asks for neither Korean nor English, so the
 * caller can fall through to geolocation.
 */
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "ko") return "ko";
    if (base === "en") return "en";
  }
  return null;
}

/** Vercel (and most edge hosts) expose the visitor's country as a request header. */
function fromGeo(request: NextRequest): Locale | null {
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code");
  return country?.toUpperCase() === "KR" ? "ko" : null;
}

function resolveLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  return (
    fromAcceptLanguage(request.headers.get("accept-language")) ??
    fromGeo(request) ??
    routing.defaultLocale
  );
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasPrefix = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (!hasPrefix) {
    const locale = resolveLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    // Auto-detection is deliberately not persisted — only the manual KO/EN
    // toggle writes the cookie, so a saved choice always wins next time.
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  // `icon` and `apple-icon` are generated metadata routes with no file
  // extension, so they need naming here or they'd be redirected to /en/icon.
  matcher: ["/((?!api|_next|_vercel|icon|apple-icon|.*\\..*).*)"],
};
