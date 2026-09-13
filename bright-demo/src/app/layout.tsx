import type { Metadata, Viewport } from "next";
import ThemeScript from "@/components/ThemeScript";
import { AuthProvider } from "@/lib/auth";
import { PrefsProvider } from "@/lib/prefs";
import { mono, sans } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bright — web demo",
  description:
    "A browser demo of the Bright emergency-training app: pick a case, answer in your own words, get graded turn by turn.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#060607" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* suppressHydrationWarning is for <html> alone, and it is required, not a
       papering-over: ThemeScript adds `light` or `dark` to this element before
       React ever runs, so the class in the markup and the class in the DOM are
       meant to differ on any visit with a saved override. Same as bright-web. */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="h-dvh overflow-hidden antialiased">
        <PrefsProvider>
          <AuthProvider>{children}</AuthProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
