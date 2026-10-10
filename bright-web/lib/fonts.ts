import { Geist, Geist_Mono } from "next/font/google";

/**
 * Latin type is self-hosted Geist. Hangul deliberately falls back to the
 * platform face (Apple SD Gothic Neo, Noto Sans CJK, Malgun Gothic) instead of
 * a webfont: a full Korean family is megabytes, and every target OS already
 * ships an excellent one. `Pretendard` is tried first for anyone who has it.
 */
export const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-latin",
  fallback: [
    "Pretendard Variable",
    "Pretendard",
    "-apple-system",
    "BlinkMacSystemFont",
    "Apple SD Gothic Neo",
    "Malgun Gothic",
    "Noto Sans KR",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

export const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-latin",
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "SF Mono",
    "Menlo",
    "Consolas",
    "monospace",
  ],
});
