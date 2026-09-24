"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LOCALE_STORAGE_KEY,
  defaultLocale,
  isLocale,
  type Locale,
} from "@/i18n/routing";

/**
 * The whole site lives at one URL. What used to be routes (`/en/faq`, `/ko/privacy`, the
 * separate web-app deployment) are now pages this provider switches between in place: the
 * address bar never changes, but Back and Forward still work, because every page change
 * pushes a history entry *with the same URL* and a `{ page }` state that `popstate` reads.
 *
 * The current page survives a reload (sessionStorage, so it's per tab), and old links still
 * land somewhere sensible: `BootScript` reads a legacy path like `/ko/faq#q3` before first
 * paint, rewrites the address bar to `/`, and hands the page, section and locale over here.
 */

export const pages = ["home", "download", "releases", "faq", "privacy", "terms", "app"] as const;
export type Page = (typeof pages)[number] | "notFound";

export function isPage(value: unknown): value is Page {
  return value === "notFound" || (typeof value === "string" && (pages as readonly string[]).includes(value));
}

type Nav = { page: Page; section: string | null };

type Boot = Nav & { locale: Locale };

declare global {
  interface Window {
    __BRIGHT_BOOT__?: Boot;
  }
}

const PAGE_STORAGE_KEY = "bright-page";

type SiteNavValue = {
  page: Page;
  locale: Locale;
  /** Goes to a page (and optionally scrolls to an element id on it) without touching the URL. */
  go: (page: Page, section?: string) => void;
  /** The visitor's own language choice — persisted, unlike detection. */
  setLocale: (locale: Locale) => void;
};

const SiteNavContext = createContext<SiteNavValue | null>(null);

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The section may not exist on the first frame after a page swap, so look for a few frames.
 * A jump that comes with a page change is instant ("auto" would inherit the page's CSS smooth
 * scrolling and glide across a page that's still settling), and it's re-aimed once the page
 * above the section has finished laying out.
 */
function scrollToSection(id: string, smooth: boolean) {
  const glide = smooth && !reducedMotion();
  let frames = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    if (!el) {
      if (frames++ < 30) requestAnimationFrame(attempt);
      return;
    }
    el.scrollIntoView({ behavior: glide ? "smooth" : "instant", block: "start" });
    if (!glide) {
      window.setTimeout(() => el.scrollIntoView({ behavior: "instant", block: "start" }), 350);
    }
  };
  requestAnimationFrame(attempt);
}

/**
 * History state for a page, keeping whatever else is on the entry. Next's router keeps its own
 * fields there (`__NA`, its tree) and does a full reload when it pops to an entry without
 * them — so overwriting the state wholesale turned every Back into a page reload.
 */
function entryFor(nav: Nav) {
  const current = history.state as Record<string, unknown> | null;
  return { ...(current ?? {}), bright: nav };
}

function readStored(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStored(storage: "local" | "session", key: string, value: string) {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // Private windows and blocked storage: the choice holds for this visit only.
  }
}

export function SiteNavProvider({ children }: { children: React.ReactNode }) {
  // Matches the prerendered HTML (English home page) so hydration is clean; the real starting
  // point is applied straight after, before the page is shown (see BootScript's data-booting).
  const [nav, setNav] = useState<Nav>({ page: "home", section: null });
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [ready, setReady] = useState(false);
  const pendingScroll = useRef<{ section: string | null; smooth: boolean } | null>(null);

  useLayoutEffect(() => {
    const boot = window.__BRIGHT_BOOT__;
    const start: Nav = {
      page: boot && isPage(boot.page) ? boot.page : "home",
      section: boot?.section ?? null,
    };
    if (boot && isLocale(boot.locale)) setLocaleState(boot.locale);
    setNav(start);
    pendingScroll.current = start.section ? { section: start.section, smooth: false } : null;
    // Browsers would otherwise restore a stale scroll position on Back: each page is new content.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    history.replaceState(entryFor(start), "");
    setReady(true);
  }, []);

  // Show the page only once it's the right page in the right language.
  useEffect(() => {
    if (ready) document.documentElement.removeAttribute("data-booting");
  }, [ready]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const state = (event.state as { bright?: Nav } | null)?.bright;
      const next: Nav = state && isPage(state.page) ? state : { page: "home", section: null };
      pendingScroll.current = { section: next.section, smooth: false };
      setNav(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // After a page change has rendered: remember it for reloads, then land at the top or on the
  // requested section.
  useEffect(() => {
    if (!ready) return;
    writeStored("session", PAGE_STORAGE_KEY, nav.page);
    const scroll = pendingScroll.current;
    pendingScroll.current = null;
    if (!scroll) return;
    if (scroll.section) scrollToSection(scroll.section, scroll.smooth);
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [nav, ready]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const go = useCallback(
    (page: Page, section?: string) => {
      if (page === nav.page) {
        // Same page: just move within it — no history entry for a scroll.
        if (section) scrollToSection(section, true);
        else window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
        return;
      }
      const next: Nav = { page, section: section ?? null };
      // Same URL on purpose: the entry exists so Back returns to the previous page.
      history.pushState(entryFor(next), "", window.location.href);
      pendingScroll.current = { section: next.section, smooth: false };
      setNav(next);
    },
    [nav.page],
  );

  const setLocale = useCallback((next: Locale) => {
    writeStored("local", LOCALE_STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const value = useMemo<SiteNavValue>(
    () => ({ page: nav.page, locale, go, setLocale }),
    [nav.page, locale, go, setLocale],
  );

  return <SiteNavContext.Provider value={value}>{children}</SiteNavContext.Provider>;
}

export function useSiteNav(): SiteNavValue {
  const value = useContext(SiteNavContext);
  if (!value) throw new Error("useSiteNav must be used inside <SiteNavProvider>");
  return value;
}

/**
 * Runs before first paint. Works out where this visit starts — a legacy path or hash, else the
 * page this tab was last on, else home — and in which language, then puts `/` in the address
 * bar. When the start isn't the prerendered English home page it hides the page
 * (`data-booting`) until React has swapped in the right one, so there's no flash of the wrong
 * page; globals.css reveals it anyway after a moment in case the app never boots.
 */
export function BootScript() {
  const config = {
    pages,
    pageKey: PAGE_STORAGE_KEY,
    localeKey: LOCALE_STORAGE_KEY,
  };
  const script = `(function(){var c=${JSON.stringify(config)};var d=document.documentElement;var b={page:"home",section:null,locale:null};try{
var segs=location.pathname.split("/").filter(Boolean);var legacy=false;
if(segs[0]==="en"||segs[0]==="ko"){b.locale=segs.shift();legacy=true;}
if(segs.length){b.page=c.pages.indexOf(segs[0])>=0?segs[0]:"notFound";legacy=true;}
if(location.hash.length>1){b.section=decodeURIComponent(location.hash.slice(1));legacy=true;}
if(!legacy){var p=sessionStorage.getItem(c.pageKey);if(p&&c.pages.indexOf(p)>=0)b.page=p;}
if(!b.locale){var s=localStorage.getItem(c.localeKey);if(s==="en"||s==="ko")b.locale=s;}
if(!b.locale){var m=document.cookie.match(/(?:^|; )NEXT_LOCALE=(en|ko)/);if(m)b.locale=m[1];}
if(!b.locale){var l=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""];for(var i=0;i<l.length;i++){var t=String(l[i]).toLowerCase().split("-")[0];if(t==="ko"||t==="en"){b.locale=t;break;}}}
}catch(e){}
b.locale=b.locale||"en";
try{if(location.pathname!=="/"||location.hash)history.replaceState(null,"","/"+location.search);}catch(e){}
d.lang=b.locale;if(b.page!=="home"||b.locale!=="en")d.setAttribute("data-booting","");
window.__BRIGHT_BOOT__=b;})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
