# Bright — web demo

A browser version of the **Bright** training session: pick an emergency, the AI stays in
character and asks one thing at a time, you answer in your own words, and each answer gets
a mark out of ten. Ending the session produces the result card.

This is a demo, not a product. The real Bright is the Android app; nothing here is saved
once you close the tab, and the site (`../bright-web`) doesn't link to it, because there
is no public web version to advertise.

## Run it

```bash
npm install
npm run dev     # http://localhost:3001
npm run build && npm start   # production, also on 3001
```

It runs on **3001** so it can sit alongside the marketing site on 3000.

## Two modes

**Scripted preview (no key).** Out of the box there's no Groq key, so the replies come
from `src/lib/script.ts` — written by hand, with fixed scores. Nothing you type is read or
graded, and a banner says exactly that for as long as this mode is on. It exists so the
demo can be shown to someone without handing over a key.

**Live (your key).** Enter a Groq key and every turn goes to Groq for real, using the same
model the app defaults to (`openai/gpt-oss-120b`). The key is kept in this browser's
localStorage and passed through `/api/session` for each request — it is never stored on
the server, never logged, and the route holds nothing between requests. The proxy exists
so the browser isn't sending an `Authorization` header cross-origin.

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

## Layout

The session view follows the shape the chat products settled on: a single narrow column,
assistant turns as plain text with no bubble, the answer you typed in a soft bubble, the
grade as a quiet line beneath it, near-empty chrome, and a roomy composer. The one thing
that stays loud enough to read is the scripted/live disclosure under the composer.


```
src/app/page.tsx            mounts the demo
src/app/api/session/route.ts  Groq proxy — takes a key per request, keeps nothing
src/components/Demo.tsx     the session: setup, transcript, grading, completion
src/components/ResultCard.tsx  the end-of-session card, styled like the app's
src/components/Segmented.tsx   one-line choice rows used on the setup screen
src/lib/prompt.ts           ported prompt builder and turn contract
src/lib/scenarios.ts        the ten emergencies, roles, difficulties
src/lib/script.ts           the canned walkthrough used without a key
src/lib/copy.ts             UI strings, English and Korean
```

Design tokens, the Geist font setup and the icon mark are copied from `../bright-web` so
the demo looks like the same product. They're small and stable; if the palette changes
there, copy `globals.css`'s token block across.
