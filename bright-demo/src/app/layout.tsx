import type { Metadata, Viewport } from "next";
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
