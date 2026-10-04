# Server-side sessions and the hidden patient-state engine

A scenario has **hidden state** (vitals, consciousness, flags, a simulated clock) that changes by deterministic
rules based on what the trainee does. The LLM never decides the medicine: it labels the input and voices the output.

```
trainee message ─▶ 1. classify (small LLM, JSON)  ─▶ known action ids only (unknown ids rejected, max 4)
                   2. rules engine (pure TypeScript) ─▶ new hidden state + events + engine log
                   3. narrate (LLM) from the NEW state ─▶ reply, filtered for doses / invented numbers / links
                   4. commit state (compare-and-swap)  ─▶ response: reply + public monitor state
```

Code: `supabase/functions/_shared/sim/` (`engine.ts` pure rules, `simconfig.ts` strict validator, `classify.ts`,
`narrate.ts`, `safety.ts`, `handler.ts`), entry point `supabase/functions/sim/index.ts`.

## API: `POST /functions/v1/sim` (user JWT required, verified inside the function like `chat` and `grade`)

| action | body (no other keys allowed) | result |
|---|---|---|
| `start` | `scenario_id`, `language` | `session_id`, `title`, `opening` (static text, **no LLM call, no quota**), `state` (monitor), `review`, `max_turns` |
| `turn` | `session_id`, `messages` (recent history, last one is the trainee's) | `reply`, `state`, `turn`, `status`, `remaining`, `limit` |
| `end` | `session_id` | `status` (idempotent) |

`grade` accepts an optional `session_id`: the engine log is then given to the grader as trusted evidence ("which actions
happened and on which turn, what never happened, final state"), and every graded item comes back with its rubric `tags`.

Errors are small codes: `unauthenticated`, `age_required`, `invalid_input`, `not_found` (also for someone else's session),
`session_closed`, `session_busy`, `daily_limit`, `budget_reached`, `rate_limited`, `upstream_error`.

`session_id` is the one key beyond the original `scenario_id/language/messages` contract: an opaque server-issued handle whose
ownership is checked against the token's user id. The client still never sends a model, prompt, token limit, tier, user id,
actions or state.

## What is stored

Table `sessions` (state only, never message text): `id, user_id, scenario_id, state jsonb, turn_count, status, started_at,
updated_at`, plus an internal `turn_lock_until`. Owners can `select` their own rows (RLS); nothing else is granted to
clients. All writes go through `SECURITY DEFINER` functions executable only by `service_role`, each filtering on `p_user`.
`state` holds vitals, flags, which actions were done (first/last turn, count) and the **engine log** (per turn: actions applied,
actions blocked). At most 4 sessions per user stay `active` (older ones become `abandoned`).

Scenario engine config lives in the new server-only column `scenarios.sim` (column-level grants keep it unreadable to clients).

## Rules

`sim` = `initial` state, `flags` (id → description for the narrator), `actions` (id, plain-language `description` for the
classifier, `requires`, `effects`, `repeatable`, `extra_seconds`, `outcome`) and `rules` (`when` conditions → `effects`, `once`,
`narrate`). Conditions: `done`, `not_done`, `done_now`, `flag`, `not_flag`, `turn_gte`, `turn_lt`, `clock_gte`, `vital`,
`consciousness`. Effects: `add`, `set`, `toward` (no overshoot), `set_flag`, `clear_flag`, `set_consciousness`, `end`.
Example from the shipped anaphylaxis scenario: *if `give_epinephrine` is not done and turn >= 4, SBP -8, DBP -5, HR +6, RR +2.*

A turn advances the simulated clock by `turn_seconds` (+ an action's `extra_seconds`). Actions apply in config order (never
the LLM's order); each rule is evaluated once per turn in config order; vitals are clamped to physiological bounds.
Scenario text the LLM can see may not contain a dose-shaped phrase, and outcome/narration hints may not contain digits
(validator-enforced).

## Authoring scenarios

Edit `supabase/scenarios/<slug>.json` (shared rules + per-language text), then
`deno run --allow-read --allow-write scripts/gen-sim-seed.ts`, which rewrites `supabase/seed_sim.sql`. A test fails if the
SQL and JSON disagree. The two shipped scenarios (`anaphylaxis-sim`, `asthma-sim`, each in English and Korean) are drafts by
a non-clinician: **needs medical review before release**; rows are inserted inactive and titled accordingly.

Rubric items carry `tags` from a fixed vocabulary (`airway, breathing, circulation, assessment, medication, communication,
escalation, safety`) so a skill profile can aggregate by area. Migration `20261004000002_rubric_tags.sql` tags the
existing seeded scenarios.

## Cost and quota

One turn = **one** user message of daily quota (refunded on any failure before commit), **two** LLM calls, both recorded
via `record_usage` (per-user usage and the global daily budget). Estimated from the real prompts (`cost_estimate_test.ts`):
about **1.2x** the old single-call `chat` turn (about 1.4x if both calls burn 150 hidden reasoning tokens), limit 2x.
`LLM_MODEL_CLASSIFY` (optional secret) lets the classifier use a cheaper model.

## Tests

```bash
cd supabase/functions && deno test -A          # engine, config, classifier, narration safety, handlers, source guards, cost
scripts/run-sql-tests.sh                       # RLS + ownership with two users, quota, turn lock race, on a throwaway local Postgres
./gradlew :shared:testDebugUnitTest            # includes PatientVitalsTest
```

## Known limits

- The classifier is an LLM: a trainee can *say* they gave a drug without doing anything else, exactly as in roleplay. Damage
  is bounded by preconditions, one-off actions, a cap of 4 actions per turn and strict output validation. The engine does not
  check doses; it checks that an action happened.
- The narration filter blocks dose-shaped phrases, numbers not in the state and links. It cannot catch a spelled-out number or
  a drug *name* without a dose; the prompt forbids those, code does not.
- The client monitor and `onEngineState(...)` exist; the HTTP call to `sim` is not wired in the app yet (needs the sign-in work).
