# Bright — website

The website for **Bright**, the AI emergency-scenario training app, and the app itself in the
browser: landing page, download and install guide, a live releases list, FAQ, privacy policy
and terms, and the training app with Google sign-in — Korean and English throughout, on a
60-30-10 palette: porcelain, navy and clinical red.

**It is all one page at one URL.** Home, the other pages, signing in and training all swap in
place; the address bar always says `/`. The web app used to be a separate deployment
(`bright-demo`) and lives here now, under `src/components/app/` and `src/lib/app/`.

This is a standalone Next.js project. It is **not** part of the Gradle build, and it is
separate from `bright-site/` (the older Firebase-hosted static site).

## Pages — one URL

What used to be routes are pages that `src/lib/site-nav.tsx` switches between. Nothing in the
address bar changes, but the browser still behaves:

- **Back / Forward** work: every page change pushes a history entry with the *same* URL and a
  `{ page }` state, and `popstate` puts that page back.
- **Reload** stays on the page you were on (sessionStorage, per tab).
- **Old links** still land: a path like `/ko/faq` or `/en/privacy#rights` is read before first
  paint by `BootScript`, which picks the page, section and language, then rewrites the address
  bar to `/`. Unknown paths show the not-found page, also at `/`. The Worker's
  `not_found_handling: "single-page-application"` is what serves the page for those paths.
- The tab title follows the page.

| Page | What it is |
| --- | --- |
| `home` | Landing page: hero, the drill (`#what`), progress / skill profile (`#progress`), two ways in (`#how`) |
| `app` | The training app — see "The app" below |
| `download` | Install guide, requirements, and the latest build read live from GitHub |
| `releases` | Every published release, read live from the GitHub Releases feed |
| `faq` | Accordion FAQ |
| `privacy` | Privacy policy — what's stored on device, what leaves it, what's never collected |
| `terms` | Terms of use, including the medical disclaimer |

Internal links are `LinkButton` / `PageLink` (buttons that call `go(page, section?)`), never
`href`s — an `href` would change the URL. In-page jumps (the legal table of contents, the
home sections) scroll instead of following a `#hash`.

`download` and `releases` call the public GitHub API (`tyngzfgsf/Bright-app`) from the
browser, once per visit — the same feed the Android app checks for updates. If GitHub is
unreachable the pages fall back to a plain link rather than failing to render.

The privacy and terms pages describe the app as it actually behaves today. **If the app's data
handling changes, update `messages/*.json` in the same release.**

## The app

Sign in from the header (or inside the app) with Google, or open the app without an account:

1. **Own Groq key** saved in the app's Settings → sent to bright-proxy as `X-Groq-Key`, not
   metered.
2. **Signed in** → the Firebase ID token goes to bright-proxy, which uses Bright's key, 40
   turns a day.
3. **Neither** → a scripted preview (`src/lib/app/script.ts`), no network at all.

Signing in from the site's header takes you straight into the app once it succeeds. The app's
rail logo goes back to the site. The app and the site share one theme and one language:
changing either in the app's Settings changes the whole site, and the other way round.

`src/lib/app/prompt.ts` is a port of the Android app's `ScenarioPromptBuilder`, and
`scenarios.ts` of its scenario list. **If the app's prompt or scenarios change, update both.**
Sessions persist in this browser's localStorage (newest 60). Chill mode (`ChillPlayer.tsx`,
`lib/app/chill.ts`) synthesises its ambient audio with WebAudio — there are no audio files.

## Stack

- Next.js 15 (App Router) as a static export (`output: "export"`) — one prerendered page
- TypeScript, Tailwind CSS v4 (CSS-first config — tokens live in `src/app/globals.css`)
- Framer Motion for scroll reveals, the hero name reveal, and the looping chat illustration
- next-intl, client-side only (both locales' messages ship with the page)
- Firebase Auth for Google sign-in (the public `bright-34c23` web config, `src/lib/app/firebase.ts`)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to out/
npm start          # serve out/ the way production does (wrangler dev)
npm run typecheck  # tsc --noEmit
```

Live AI turns go through bright-proxy; `NEXT_PUBLIC_PROXY_URL` is baked in at build time and
defaults to `http://localhost:8787` (the proxy's own `wrangler dev`).

## Deploy

Cloudflare Workers static assets — no Worker script, nothing beyond the free plan:

```bash
NEXT_PUBLIC_PROXY_URL=https://bright-proxy.jchang2032.workers.dev npm run deploy
```

Three things outside this folder have to agree with the deployed origin:

- **bright-proxy**'s `ALLOWED_ORIGINS` (`../bright-proxy/wrangler.jsonc`) must list it, or
  live turns are refused. Redeploy the proxy after changing it.
- **Firebase console → Authentication → Settings → Authorized domains** must list it, or
  Google sign-in fails.
- `NEXT_PUBLIC_SITE_URL` sets the canonical/OG/sitemap origin (defaults to the Firebase
  Hosting origin in `src/lib/site.ts`).

`public/_headers` names the content type of the generated icons, which are exported without a
file extension.

## Language detection

`BootScript` (in `src/lib/site-nav.tsx`) picks the language before first paint, in this order:

1. A `/ko/…` or `/en/…` prefix on an old link.
2. `bright-locale` in localStorage — written **only** by the manual KO/EN toggle (or the app's
   language setting), so a visitor's own choice always wins on return visits. The old site's
   `NEXT_LOCALE` cookie is still read after it.
3. The browser's `navigator.languages`.
4. English.

There is no server any more, so the old IP-geolocation step is gone. The prerendered HTML is
English; when a visit starts in Korean (or on a page other than home) the body is held hidden
(`html[data-booting]`) until the right page is in, so nothing flashes — and revealed after
1.5s regardless, in case the script never runs.

## Type

Latin text is self-hosted **Geist** and **Geist Mono** through `next/font` (`src/lib/fonts.ts`).
Hangul deliberately has **no webfont**: a full Korean family is megabytes, and every target
OS ships a good one, so the stack falls through to Pretendard → Apple SD Gothic Neo →
Malgun Gothic → Noto Sans KR. That also means Latin-only tracking rules would look wrong
on Hangul, so `globals.css` tightens `.eyebrow`, `.eyebrow-sm` and `.display` under
`html[lang="ko"]`.

## Theme

Light/dark follows the system by default (`prefers-color-scheme`). The header toggle sets
an explicit `.light` / `.dark` class on `<html>` and stores it in `localStorage`
(`bright-theme`); `src/components/ThemeScript.tsx` re-applies it before first paint so
there's no flash. Colors are CSS variables in `globals.css`, exposed to Tailwind through
`@theme inline`.

## Motion

One easing curve and two springs live in `src/lib/motion.ts`; components import those
rather than inventing timings. Scroll entrances (`Reveal`), the hero name reveal, the
nav's sliding pill, the table-of-contents marker, the FAQ accordion and the route
cross-fade all use them.

Every animation checks `useReducedMotion()`, and `globals.css` also flattens transitions
under `prefers-reduced-motion: reduce`. The chat mockup renders all messages at once
instead of looping when reduced motion is on.

Two constraints worth keeping:

- The page cross-fade in `PageFade.tsx` animates **opacity only**. A transform
  there would become the containing block for the fixed reading-progress bar.
- The theme toggle swaps its icon in place rather than through `AnimatePresence` — an exit
  animation left the button visibly empty for a moment on every load.

## Pointer

`Cursor.tsx` replaces the pointer with a dot that tracks it exactly and a ring that
follows a beat behind, both drawn with `mix-blend-difference` so one white shape stays
legible on paper, on the dark theme and on the black result card. The ring grows over
anything clickable, tightens on press, and a click leaves a ripple that cleans itself up.

It is deliberately conditional. The native cursor is hidden by a `has-cursor` class the
script adds only after a real mouse has moved, so touch devices — and any visit where the
script doesn't run — keep the system cursor. Reduced motion renders nothing at all.

`Magnetic.tsx` pulls the primary calls to action a fraction of the way toward the pointer,
and cards carry a highlight that follows the pointer across them (`.spotlight`, fed by
`--mx` / `--my`).

## Surfaces

Three surfaces (`paper`, `raised`, `sunken`), four text weights and three line strengths
are defined as CSS variables and exposed to Tailwind via `@theme inline`. The neutrals are
warm off-white / blue-slate rather than pure white / black, which is easier on the eye.

The palette is **60-30-10**:

- **60% Porcelain** — the neutrals above: every page background, cards, lines, body text.
- **30% Navy** — structure. `primary` (fill), `primary-ink` (headings, section labels; periwinkle
  on dark surfaces), `primary-soft` (tint), `on-primary`. Two sections sit fully on it via
  `.band-primary` — Progress (`<Section tone="primary">`) and the footer. That class
  re-points the surface/ink tokens, so anything inside adapts without its own dark styles.
- **10% Clinical red** — calls to action only: `accent` / `on-accent` on primary buttons, "Open
  app", the demo's send and "Drill it" buttons, and the logo's sun. If it isn't something to
  press, don't make it red.

`good` / `warn` are the skill panel's improving / slipping trends, always next to an arrow
and a word. Every text colour clears WCAG AA on every surface in both themes, bands
included — check new pairings before adding them. The result/share card stays black because
the app's real one is.

`.grain` puts a fixed film-grain overlay on the page, `.sheen` adds a one-pixel top
highlight to cards, and `.hero-wash` is the coral-and-amber radial wash behind the hero and
page headers.

## The mark

The site logo, the favicon, the apple-touch icon and the OG card all use the app's own
launcher icon: a rising sun over a horizon. The geometry is taken verbatim from
`app/src/main/res/drawable/ic_launcher_foreground.xml` in the Android project, and the
crop matches the framing of `iosApp/…/AppIcon-1024.png`, so all four stay one shape.

- `src/components/BrightMark.tsx` — the inline SVG glyph, drawn in `currentColor` so it
  works on either theme beside the wordmark.
- `src/lib/mark.ts` — the same measurements as numbers, because the generated images
  can't use SVG paths and rebuild the shapes out of boxes instead.
- `app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx` — the black tile
  with the white mark, generated at build time, so there are no binary assets to keep
  in sync.

**If the app's launcher icon changes, update `BrightMark.tsx` and `mark.ts` together.**

Because `/icon` and `/apple-icon` have no file extension, `public/_headers` names their
content type for Workers static assets.

## Copy

All strings live in `messages/en.json` and `messages/ko.json`. The two locales are written
independently rather than translated line-by-line, so edit both when copy changes.

Ground rules for this site's copy: no invented metrics, user counts, testimonials, or
features. Anything unbuilt (voice input, cloud sync, Google sign-in, iOS) is labelled as
planned or in development in the **Status** section, and the app's distribution is
described accurately — GitHub Releases, no Play Store listing.

## Layout

```
messages/               en.json, ko.json — all site copy, including the legal pages
public/_headers         content types for the extensionless generated icons
src/app/                layout (metadata, theme + boot scripts), page.tsx (mounts <Site>),
                        icons, OG image, sitemap, robots, manifest
src/app/globals.css     design tokens, theme switching, shared classes, the app's extras
src/components/Site.tsx the whole site: providers, header/footer, which page is showing
src/components/pages/   Home, Download, Releases, Faq, Privacy, Terms, NotFound
src/components/app/     the training app: shell, rail, transcript, composer, dialogs, chill
src/components/         Header, Footer, Hero, ChatDemo, Section, Reveal, PageHeader,
                        LegalDoc + TocNav, FaqList, ReleaseNotes, LinkButton, PageLink, …
src/lib/site-nav.tsx    the one-URL navigation, language, and the pre-paint BootScript
src/lib/app/            auth, prefs, sessions, prompt, scenarios, script, copy, chill, storage
src/i18n/routing.ts     the two locales and the storage key for a manual choice
src/lib/site.ts         links (repos, releases API) and the site URL
src/lib/releases.ts     GitHub Releases fetch + useReleases(), null on any failure
```

## OG image

`src/app/opengraph-image.tsx` generates a 1200×630 card at build time. It's Latin-only on
purpose — the generator has no Korean face bundled. To use a real screenshot instead, drop
`public/og.png` in and point `openGraph.images` at it in `src/app/layout.tsx`.
