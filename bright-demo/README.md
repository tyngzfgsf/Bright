# Bright — web demo

A browser version of the **Bright** training session: pick an emergency, the AI stays in
character and asks one thing at a time, you answer in your own words, and each answer gets
a mark out of ten. Ending the session produces the result card.

This is a demo, not a product. The real Bright is the Android app; the site
(`../bright-web`) doesn't link to it, because there is no public web version to advertise.

## Run it

```bash
npm install
npm run dev     # http://localhost:3001
npm run build && npm start   # production, also on 3001
```

It runs on **3001** so it can sit alongside the marketing site on 3000.

> Don't run `next build` while `next dev` is up — they share `.next` and the dev server
> starts throwing `__webpack_modules__[moduleId] is not a function`. Stop dev first, or
> `rm -rf .next` and restart it afterwards.

## Two modes

**Scripted preview (no key).** Out of the box there's no Groq key, so the replies come
from `src/lib/script.ts` — written by hand, with fixed scores. Nothing you type is read or
graded, and a banner says exactly that for as long as this mode is on. It exists so the
demo can be shown to someone without handing over a key.

**Live (your key).** Enter a Groq key in Settings › Groq key and every turn goes to Groq
for real, using the same model the app defaults to (`openai/gpt-oss-120b`). The key is
kept in this browser's localStorage and passed through `/api/session` for each request —
it is never stored on the server, never logged, and the route holds nothing between
requests. The proxy exists so the browser isn't sending an `Authorization` header
cross-origin.

Get a free key at [console.groq.com/keys](https://console.groq.com/keys).

## Matching the app

`src/lib/prompt.ts` is a port of the app's `ScenarioPromptBuilder`
(`shared/src/commonMain/kotlin/com/bright/app/domain/ScenarioPromptBuilder.kt`): the same
system prompt, the same one-question-per-turn instruction, the same strict JSON reply
(`score`, `feedback`, `next_prompt`, `session_complete`), and the same opening and
end-session messages. The scenario list, roles and difficulty wording come from the app's
`strings.xml` and `Scenario.kt`.

**If the app's prompt or scenario list changes, update `prompt.ts` and `scenarios.ts` to
match** — otherwise the demo drifts away from what it's demonstrating.

## Layout — a chat site, not the app in a browser

The screen is the shape the chat products settled on, deliberately not the shape of the
Android app:

- **A left rail** holding new-session, the sessions you've run grouped by day, and — at
  the bottom — Settings and the account row. Below `lg` it becomes a drawer.
- **No setup screen.** A new session is an empty state with a greeting, a composer, and
  the ten emergencies as chips. Who you are, who the AI plays and the difficulty are pills
  *inside* the composer, the way a model picker is. Typing your own case and sending it
  starts a session on that case.
- **A near-empty top bar**: the rail toggle when the rail is hidden, the session's name,
  and End session.
- **The transcript** is one narrow column: assistant turns as plain text with no bubble,
  your answer in a soft bubble, the grade as a quiet line beneath it, and a roomy
  composer. The one thing that stays loud enough to read is the scripted/live disclosure
  under the composer.

Sessions persist in `localStorage` (newest 60), so the rail survives a reload and a
session can be reopened and carried on — its API history is stored with it.

## Motion

Same system as `../bright-web`, and `Cursor.tsx` / `Magnetic.tsx` are copies of its files
— keep them in step if either changes there.

- **The custom cursor**: a dot that tracks the pointer exactly and a ring a beat behind,
  drawn in `mix-blend-difference` so one white shape reads on paper, on the near-black
  dark theme and on the black result card alike. It grows over anything clickable,
  tightens on press, and leaves a ripple where you clicked. It only takes over once a real
  mouse has moved (`html.has-cursor`), so touch and a page whose script never ran keep the
  system cursor — and text fields keep their I-beam, because losing it in a composer makes
  it unclear you can type there.
- **Replies play out** rather than appearing whole (`StreamedText.tsx`). The turn arrives
  in one piece — the model isn't streamed — but a paragraph landing at once is the most
  app-like thing left in a chat window. The full text renders underneath at `invisible`
  with the revealed slice over it, so the paragraph takes its final height on the first
  frame and nothing below it jumps.
- **The rail animates as a list**: rows carry `layout`, so adding or deleting slides the
  others; the active highlight is one shared element (`layoutId`) that travels between
  rows. The desktop rail collapses by animating its width with the `<Sidebar>` still
  mounted, so the list doesn't replay its entrance every time it comes back.
- **Numbers count up** (`CountUp.tsx`) on the per-answer grade and the session average.
- **The theme cross-fades**: `applyTheme` adds `.theme-anim` for one beat, then takes it
  off so it never slows a hover. The first application on load isn't animated.
- **`.spotlight`** lights the composer under the pointer, from `--mx`/`--my`.

Every piece of this checks `useReducedMotion` or sits behind a
`prefers-reduced-motion: reduce` rule, and collapses to a plain render.

Two mounted copies of `<Sidebar>` exist at once (the desktop rail and the mobile drawer),
which is why it takes an `instanceId` — a shared `layoutId` across the two would make the
active highlight fly between them.

## Chill mode

Something to put on while you drill. The toggle is at the right of the top bar — a
waveform when nothing is playing, a four-bar meter once something is — and it opens a
Connect-shaped panel: one piece playing on one device, artwork, transport, loudness.

**The sound is made here, not fetched.** `src/lib/chill.ts` builds each piece out of
WebAudio nodes — a pink-noise bed under a held chord, a lowpass sweeping across it on an
LFO slower than one cycle a minute, every note of the chord swelling on its own clock, and
on two of the four pieces a single note every ten seconds or so, never on a grid. There
are no audio files in the repo and nothing is requested, so the demo still works offline,
on a fresh clone, with no account and nothing to license.

That also makes the artwork honest: the rings breathe on the analyser's RMS and the meter
along the bottom of the tile is the real spectrum, read every frame and written straight
to the DOM — fifteen bars of React state at 60fps is not worth it. A skip is
direction-aware, so the piece you left slides out the way you sent it.

- **Nothing is built until the first click.** An AudioContext made outside a gesture
  starts suspended, so `ChillEngine` doesn't exist until Play is pressed. Pausing fades
  the master gain down and then suspends the context, which stops it costing anything and
  drops the tab's "playing audio" mark; playing again resumes the piece that's already
  built rather than starting a new one.
- **Pieces cross over rather than cut.** Each has its own fader, so a skip rides the old
  one out over 0.9s under the new one coming up over 1.6s. Sources are stopped after the
  fade lands, never during it — stopping mid-fade clicks.
- **No scrubber.** There's no file to seek in: the piece would play forever. The clock is
  a nominal length, and reaching it is what moves us on to the next piece.
- **The loudness is a real `<input type="range">`** (`.rail` in `globals.css` paints it
  from `--fill`), so arrow keys, Home/End and the screen reader all come free. The level
  is ramped, not jumped, so dragging doesn't step it.
- Chill mode also lights the room: `.chill-wash`, two very soft pools drifting behind the
  transcript for as long as something is playing.

The piece and the volume are remembered (`STORAGE.chill`); playing is not, since a browser
won't start audio on a page load without a gesture anyway. Under
`prefers-reduced-motion: reduce` the rings stop, the meter parks and the frame loop never
starts — the sound is unaffected.

## Accounts

`src/lib/auth.tsx` is a **stub**. The sidebar account row, the sign-in sheet and the
Account section of Settings are all built against its interface, but nothing talks to a
server yet: pressing "Continue with Google" says so. Turning on Firebase is a change to
that one file — the steps are written at the top of it. Note the repo-wide gotcha about
pasting Firebase config: take the `firebaseConfig` object only, not the
`import { initializeApp }` boilerplate around it.

```
src/app/layout.tsx            providers + the pre-paint theme script
src/app/page.tsx              mounts the shell
src/app/api/session/route.ts  Groq proxy — takes a key per request, keeps nothing

src/components/App.tsx        the shell: rail, top bar, turn-taking, dialogs
src/components/Sidebar.tsx    new session, history by day, Settings, account
src/components/Welcome.tsx    the empty state that replaced the setup screen
src/components/Transcript.tsx the conversation and the end-of-session block
src/components/Composer.tsx   the input box, shared by both views
src/components/ChillPlayer.tsx   chill mode: the panel, transport and artwork
src/components/Cursor.tsx     the custom pointer (copy of bright-web's)
src/components/Magnetic.tsx   pulls a control towards the pointer
src/components/StreamedText.tsx  a reply revealing itself, with a caret
src/components/CountUp.tsx    a number running up to its value
src/components/Thinking.tsx   the three dots while a turn is in flight
src/components/SettingsDialog.tsx  General / defaults / key / account / data
src/components/SignInDialog.tsx    the Google sheet, on the stubbed call
src/components/SelectPill.tsx      the pills inside the composer
src/components/Dialog.tsx     the one modal shell
src/components/Icons.tsx      the icon set
src/components/ResultCard.tsx the end-of-session card, styled like the app's

src/lib/chill.ts      the four ambient pieces, synthesised as they play
src/lib/prefs.tsx     theme, language and session defaults, persisted
src/lib/auth.tsx      the account stub described above
src/lib/sessions.ts   session shape, persistence, day grouping
src/lib/storage.ts    every localStorage key, and readers that never throw
src/lib/prompt.ts     ported prompt builder and turn contract
src/lib/scenarios.ts  the ten emergencies, roles, difficulties
src/lib/script.ts     the canned walkthrough used without a key
src/lib/copy.ts       UI strings, English and Korean
```

Design tokens, the Geist font setup and the icon mark are copied from `../bright-web` so
the demo looks like the same product. They're small and stable; if the palette changes
there, copy `globals.css`'s token block across.
