export const site = {
  name: "Bright",
  slogan: "A step for your brighter future.",
  /** Public repo: built APKs are published here on every version tag. */
  releasesRepo: "https://github.com/tyngzfgsf/Bright-app",
  releasesLatest: "https://github.com/tyngzfgsf/Bright-app/releases",
  /** Contact route for privacy/terms questions and bug reports. */
  issues: "https://github.com/tyngzfgsf/Bright-app/issues",
  /** Source repo — private for now. */
  sourceRepo: "https://github.com/tyngzfgsf/Bright",
  /** Feed the app itself checks for updates; the releases page reads the same one. */
  releasesApi:
    "https://api.github.com/repos/tyngzfgsf/Bright-app/releases?per_page=30",
  /** The chat app (bright-demo): sign in with Google, or bring a Groq key. */
  webApp: process.env.NEXT_PUBLIC_WEB_APP_URL ?? "https://bright-demo.jchang2032.workers.dev",
  /** Used for canonical/OG URLs; override with NEXT_PUBLIC_SITE_URL at build time. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://bright-34c23.web.app",
} as const;

export const THEME_STORAGE_KEY = "bright-theme";
