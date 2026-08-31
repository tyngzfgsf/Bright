# Bright — retention features plan (spaced repetition, streaks)

Goal: turn the skill-profile data Bright already collects into an actual reason to come
back daily — the "Stage 0" data-moat work identified in the defensibility research,
recommended to happen *before* the freemium/subscription launch, not after.

This track needs **no backend and no login** — it works entirely on the existing local
Room data (`SessionEntity`, per-answer scores) already being collected. It can proceed in
parallel with, or ahead of, BACKEND_PLAN.md.

**Same ground rule as the other two plans: verify each phase (`./gradlew clean assembleDebug`,
then actually run it) before moving to the next.**

## Phase 1 — Track missed/low-scored questions, not just session averages

- Currently `SkillProfile.kt` aggregates scores per scenario *type*. This phase adds
  tracking at the *individual question* level: which specific questions/scenarios a
  trainee scored low on, not just which category.
- Store enough to re-ask a similar case later: scenario type, the specific question asked,
  the score received, and when.
- Verify: after a low-scored answer, confirm the record persists and survives an app restart.

## Phase 2 — Spaced-repetition scheduler

- Simple SM-2-style scheduling (the same algorithm behind Anki/Picmonic-style spaced
  repetition): a missed question resurfaces sooner; a well-answered one resurfaces later,
  with the interval growing each time it's answered well.
- Add a "Review queue" — a way to start a session made specifically of due-for-review
  questions, separate from picking a fresh scenario type.
- Verify: deliberately score a scenario low, confirm it shows up in the review queue
  before other scenarios do.

## Phase 3 — Daily streak

- A simple local counter (DataStore, same pattern as existing prefs): consecutive days
  with at least one completed session.
- Surface it visibly on Home — this is the cheap, disproportionately effective retention
  mechanic cited across Duolingo/Picmonic/Speak in the research.
- Verify: streak increments correctly across real day boundaries, resets appropriately if
  a day is missed.

## Phase 4 — Home screen integration

- Surface "due for review" count and the streak prominently on Home, likely alongside or
  replacing the current weak-spot card — the review queue is the more specific, more
  actionable version of the same idea.
- Verify: the whole loop feels obvious to a first-time user — weak spot found → resurfaces
  automatically → streak rewards showing up daily.

## Explicitly deferred to later (needs backend — see BACKEND_PLAN.md)

- **Weekly leaderboard / cohort features** — inherently multi-user, needs accounts and a
  server to compare across users. Don't attempt this on local-only data.
- **Group-buy / study-group discounts** — a monetization mechanic, comes after
  BACKEND_PLAN.md's subscription phase exists.

## Why this order

The research is specific on this point: an AI-roleplay app is not defensible on the AI
alone, and the retention mechanics competitors actually win on (spaced repetition,
streaks, accumulated performance data) are cheap to build relative to backend
infrastructure. Landing this before the subscription launch means the free tier is
already habit-forming before anyone's asked to pay for it.
