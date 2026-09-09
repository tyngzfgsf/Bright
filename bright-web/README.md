# Bright — website

The website for **Bright**, the AI emergency-scenario training app: landing page, download
and install guide, a live releases list, FAQ, privacy policy and terms — Korean and
English throughout, monochrome, built to be deployed on Vercel.

This is a standalone Next.js project. It is **not** part of the Gradle build, and it is
separate from `bright-site/` (the older Firebase-hosted static site that carries the
Google-sign-in / Groq-key work).

## Pages

Every route exists in both locales, under `/en/…` and `/ko/…`:

| Route | What it is |
| --- | --- |
| `/` | Landing page: hero, what it does, how it works, design philosophy, status, get the app |
| `/download` | Install guide, requirements, and the latest build read live from GitHub |
| `/releases` | Every published release, read live from the GitHub Releases feed |
| `/faq` | Accordion FAQ, with `FAQPage` structured data for search results |
| `/privacy` | Privacy policy — what's stored on device, what leaves it, what's never collected |
| `/terms` | Terms of use, including the medical disclaimer |

`/download` and `/releases` call the public GitHub API (`tyngzfgsf/Bright-app`) with a
one-hour ISR revalidate — the same feed the Android app checks for updates. If GitHub is
unreachable the pages fall back to a plain link rather than failing to render.

The privacy and terms pages describe the app as it actually behaves today: local Room
storage, the Groq key held in on-device preferences, exactly two network hosts
(`api.groq.com` and `api.github.com`), and no analytics or crash-reporting SDK. **If the
app's data handling changes, update `messages/*.json` in the same release.**

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4 (CSS-first config — tokens live in `src/app/globals.css`)
- Framer Motion for scroll reveals, the hero name reveal, and the looping chat illustration
- next-intl for i18n (`en`, `ko`)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000 → redirects to /en or /ko
npm run build      # production build
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
```

## Deploy

Vercel, no configuration needed — import the repo, set **Root Directory** to `bright-web`,
and deploy. Set `NEXT_PUBLIC_SITE_URL` to the production origin so canonical/OG/sitemap
URLs are right (it defaults to the Firebase Hosting origin).

The site uses middleware for locale detection, so it needs a Node/edge runtime — a pure
`next export` static build would drop the auto-detect redirect (everything else is
statically prerendered: `/en` and `/ko` are both SSG).

## Language detection

`src/middleware.ts` resolves the locale for any unprefixed path, in this order:

1. `NEXT_LOCALE` cookie — written **only** by the manual KO/EN toggle, so a visitor's own
   choice always wins on return visits.
2. `Accept-Language`, honouring q-values.
3. IP geolocation — `x-vercel-ip-country` (also accepts `cf-ipcountry`): `KR` → Korean.
4. English.

Auto-detection deliberately does not write the cookie, so it never masquerades as a choice
the visitor made.

## Theme

Light/dark follows the system by default (`prefers-color-scheme`). The header toggle sets
an explicit `.light` / `.dark` class on `<html>` and stores it in `localStorage`
(`bright-theme`); `src/components/ThemeScript.tsx` re-applies it before first paint so
there's no flash. Colors are CSS variables in `globals.css`, exposed to Tailwind through
`@theme inline`.

## Motion

Every animation checks `useReducedMotion()`, and `globals.css` also flattens transitions
under `prefers-reduced-motion: reduce`. The chat mockup in the hero renders all messages
at once instead of looping when reduced motion is on.

## Copy

All strings live in `messages/en.json` and `messages/ko.json`. The two locales are written
independently rather than translated line-by-line, so edit both when copy changes.

Ground rules for this site's copy: no invented metrics, user counts, testimonials, or
features. Anything unbuilt (voice input, cloud sync, Google sign-in, iOS) is labelled as
planned or in development in the **Status** section, and the app's distribution is
described accurately — GitHub Releases, no Play Store listing.

## Layout

```
messages/            en.json, ko.json — all site copy, including the legal pages
src/app/[locale]/    layout (chrome, metadata, theme script), the six routes,
                     not-found, opengraph-image
src/app/globals.css  design tokens, theme switching, small shared classes
src/components/      Header, Footer, Hero, ChatDemo, Section, Reveal, PageHeader,
                     LegalDoc + TocNav, FaqList, ReleaseNotes, page sections
src/i18n/            next-intl routing, request config, navigation helpers
src/middleware.ts    locale detection + redirect
src/lib/site.ts      links (repos, releases API) and the site URL
src/lib/releases.ts  GitHub Releases fetch, with a null return on any failure
src/lib/metadata.ts  hreflang/canonical helper used by every route
```

Header and footer live in the locale layout, so every page shares them. Internal links go
through next-intl's `Link` so the locale prefix is preserved; the language switch keeps
you on the page you're already reading.

## OG image

`src/app/[locale]/opengraph-image.tsx` generates a 1200×630 placeholder card at request
time. It's Latin-only on purpose — the generator has no Korean face bundled. To use a real
screenshot instead, drop `public/og.png` in and point `openGraph.images` at it in
`src/app/[locale]/layout.tsx`.
