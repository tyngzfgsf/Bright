"use client";

import { useEffect, useRef, useState } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import BackToTop from "./BackToTop";
import Cursor from "./Cursor";
import Footer from "./Footer";
import Header from "./Header";
import PageFade from "./PageFade";
import App from "./app/App";
import SignInDialog from "./app/SignInDialog";
import DownloadPage from "./pages/DownloadPage";
import FaqPage from "./pages/FaqPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import PrivacyPage from "./pages/PrivacyPage";
import ReleasesPage from "./pages/ReleasesPage";
import TermsPage from "./pages/TermsPage";
import { AuthProvider, useAuth } from "@/lib/app/auth";
import { COPY } from "@/lib/app/copy";
import { PrefsProvider } from "@/lib/app/prefs";
import { SiteNavProvider, useSiteNav, type Page } from "@/lib/site-nav";
import en from "../../messages/en.json";
import ko from "../../messages/ko.json";

const MESSAGES = { en, ko } as const;

/**
 * The entire site: marketing pages, legal pages and the training app, all at one URL.
 * `lib/site-nav.tsx` decides which page is showing; this renders it.
 */
export default function Site() {
  return (
    <SiteNavProvider>
      <IntlProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </IntlProvider>
    </SiteNavProvider>
  );
}

function IntlProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useSiteNav();
  // Dates are only ever formatted client-side (the releases feed), so the visitor's own zone.
  const [timeZone] = useState(() =>
    typeof window === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Each page's tab title, from the same copy its old route used for <title>. */
const TITLE_KEYS: Record<Page, string> = {
  home: "meta.title",
  download: "download.meta.title",
  releases: "releases.meta.title",
  faq: "faq.meta.title",
  privacy: "privacy.meta.title",
  terms: "terms.meta.title",
  app: "meta.title",
  notFound: "notFound.title",
};

function Shell() {
  const { page, locale, go } = useSiteNav();
  const { user } = useAuth();
  const t = useTranslations();
  const [signInOpen, setSignInOpen] = useState(false);

  // Signing in from the site's header is a step towards training: once it lands, go there.
  useEffect(() => {
    if (signInOpen && user) {
      setSignInOpen(false);
      go("app");
    }
  }, [signInOpen, user, go]);

  const title = t(TITLE_KEYS[page]);
  useDocumentTitle(page === "home" || page === "app" ? title : `${title} · Bright`);

  // The film grain is part of the site's paper; the app is a working surface without it.
  useEffect(() => {
    document.body.classList.toggle("grain", page !== "app");
  }, [page]);

  const main = useRef<HTMLElement>(null);

  if (page === "app") {
    return (
      <>
        <PrefsProvider>
          <App onHome={() => go("home")} />
        </PrefsProvider>
        <Cursor />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => main.current?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {t("nav.skip")}
      </button>
      <Header onSignIn={() => setSignInOpen(true)} />
      <main id="main" ref={main} tabIndex={-1} className="flex-1 outline-none">
        <PageFade key={page}>
          <PageContent page={page} />
        </PageFade>
      </main>
      <Footer />
      <BackToTop />
      <Cursor />
      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} t={COPY[locale]} />
    </>
  );
}

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case "home":
      return <HomePage />;
    case "download":
      return <DownloadPage />;
    case "releases":
      return <ReleasesPage />;
    case "faq":
      return <FaqPage />;
    case "privacy":
      return <PrivacyPage />;
    case "terms":
      return <TermsPage />;
    default:
      return <NotFoundPage />;
  }
}

/**
 * Keeps the tab title on the current page's. Next renders the static metadata <title> and
 * re-applies it after hydration, which would quietly put the home title back after a reload
 * on another page — so this re-asserts the page's own whenever that happens.
 */
function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
