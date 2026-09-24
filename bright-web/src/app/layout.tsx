import type { Metadata, Viewport } from "next";
import ThemeScript from "@/components/ThemeScript";
import { BootScript } from "@/lib/site-nav";
import { mono, sans } from "@/lib/fonts";
import { site } from "@/lib/site";
import en from "../../messages/en.json";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1716" },
  ],
};

// One URL, so one set of metadata. English: it's what crawlers and link previews see, and the
// page itself switches to Korean before first paint for Korean visitors (see BootScript).
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: en.meta.title,
  description: en.meta.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: en.meta.title,
    description: en.meta.description,
    url: "/",
    locale: "en_US",
    alternateLocale: ["ko_KR"],
  },
  twitter: {
    card: "summary_large_image",
    title: en.meta.title,
    description: en.meta.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* suppressHydrationWarning is for <html> alone: ThemeScript and BootScript set its class,
       lang and data-booting before React runs, so markup and DOM are meant to differ. */
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <ThemeScript />
        <BootScript />
        {/* Reveal animations start at opacity 0; without JS they'd never play. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="grain flex min-h-dvh flex-col antialiased">{children}</body>
    </html>
  );
}
