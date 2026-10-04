# Bounded sessions, debrief questions and daily review

Every chat is a bounded scenario session that ends, gets graded, and is followed by a few multiple-choice practice
questions aimed at what the trainee missed. Missed questions come back as a daily Review, and a streak counts the days
the trainee practised.

Server code: `supabase/functions/_shared/{start_session,session,chat,grade}.ts`, `supabase/functions/_shared/questions/`.
Schema: `supabase/migrations/20261005000001_bounded_sessions.sql`, `20261005000002_question_bank.sql`.
Generator: `scripts/generate-questions` (`scripts/questions/`).

## 1. Session lifecycle (server-enforced)

```
start_session ──► active ──chat──► … ──► completed (Finish & score | turn cap | scenario end)
                    │                          │
                    └── 30 min idle ──► abandoned (gradeable with ≥ 3 turns)
                                               ▼
                                      grade (once) ──► get_questions ──► answer_question … ──► summary
```

- `max_turns` comes from `scenarios.max_turns` (default 15; simulation scenarios use their engine's `max_turns`). It
  is also a cost cap. The client never sets it.
- A turn is counted atomically in SQL (`claim_chat_turn`). The turn that reaches the cap completes the session, and its
  reply is still delivered. Parallel requests cannot exceed the cap (tested with 20 connections).
- Inactivity is applied lazily (`expire_idle_sessions`) by every function that reads or advances a session, so no cron
  job is needed. `ended_at` is set to the last activity plus 30 minutes.
- A failed LLM call gives the turn back (`unclaim_chat_turn`) along with the message quota.
- Every chat turn counts, including the client's opening "begin the scenario" message and `mode: "ask"` asides.
- `endConditionFor()` in `_shared/session.ts` is the hook for scenario-defined end conditions. It returns `null` today.
- Grading: an active session is finished first. An abandoned session needs at least 3 turns and a finished session at
  least 1, so no LLM call is spent on an empty transcript. A graded session stores only `score` and
  `missed_rubric_ids` (never notes or feedback text). Re-grading returns the stored result with no LLM call and no quota.
- A session completed with at least one turn adds to `activity_days.sessions_completed`, through a trigger, for the
  user's local day.

## 2. Question bank

| Rule | Where it is enforced |
|---|---|
| Clients can never read `questions` | RLS on, no policies, all grants revoked (`questions_rls.sql`) |
| Only `approved` questions are ever served or answerable | `question_candidates`, `question_for_answer`, `review_due`, `enroll_questions`, `report_question` all filter on `status = 'approved'` |
| No answer key before answering | The serving functions do not return `correct_option_ids` or `explanation` (checked on the SQL function signatures), and `publicQuestion()` builds the response field by field |
| Correctness is decided server-side | `answer_question` compares the selection with the key; the body accepts only `question_id`, `selected_ids`, `context` |
| `approved` requires `reviewed_at` | CHECK constraint |
| mcq: 4 options, unique ids, exactly one correct id that is one of the options | CHECK constraint + trigger |
| No LLM call, no quota, no budget on the question path | No `reserve()` in `questions/handlers.ts`; tests assert zero LLM calls and zero usage rows |
| Per-minute rate limit | Separate `questions` bucket (`app_config.questions_rate_limit_per_minute`, 30), independent of the LLM bucket (6) |

**Format-neutral by design.** A question is structured data: `stem`, `options: [{id, text}]` with stable ids `a`–`d`,
`correct_option_ids`, `explanation`, `rubric_item_id`, `skill_tag`, `difficulty`, `language`. Question ids never change
once inserted (the generator assigns UUIDs and inserts with `on conflict (id) do nothing`). A printable/PDF renderer can
read the same rows later. `type` already allows `ordering` and `short`; only `mcq` is served today.

### Debrief selection (`get_questions`, pure `questions/select.ts`)
1. **(a) Missed:** questions linked to the rubric items missed in this session, same scenario, one per missed item
   per round, freshest first.
2. **(b) Weakest skills:** highest miss rate in `skill_stats`.
3. **(c) Unseen filler:** this scenario first.

It serves 4 questions when 2 or more items were missed, otherwise 3. **Missed nothing → 2 stretch questions**
(difficulty 2–3) from the weakest skill, falling back to the scenario's own tags. The (a) questions are enrolled in
Review for tomorrow even if the trainee skips. Skipping is allowed: `skippable: true`.

### Scheduling (pure `questions/schedule.ts`, SM-2 style)
- **Correct:** interval 1 → 3 → round(interval × ease) days, capped at 180; ease +0.1, up to a maximum of 3.0.
- **Wrong:** interval resets to 1 day; ease −0.2, down to a minimum of 1.3.

`due_at = now + interval`. A question is "due today" when `due_at` falls before the end of the user's local day.

### Review and streak
- `review_queue` returns today's due questions, oldest first, capped at **10 a day** (minus reviews already answered
  today). It also returns `due_today` (for the Home card), `due_total`, the 3 weakest skills with attempt counts, and
  the streak.
- **Streak:** a local day counts if a session was completed that day or that day's review was completed (nothing left
  due, or the cap reached). Today not counting yet does not break the streak; the streak is still alive until the
  local day ends. The streak is computed in SQL (`streak()`) from `activity_days` in `profiles.timezone`, which the
  client sets with `set_timezone('Area/City')`. A null timezone means Asia/Seoul.
- Debrief answers alone do not count the day; only a completed review does.

## 3. Generating questions (your machine, never production)

```bash
# 1. Fill in reference_notes for each scenario and language in scripts/questions/scenarios.json
#    (Korean notes in Korean). The generator refuses empty notes.
# 2. See how many drafts you'll have to review (no network, no key):
scripts/generate-questions --dry-run
# 3. Generate (one scenario/language at a time keeps reviews manageable):
export LLM_API_KEY=...                       # typed into your own terminal; never committed
scripts/generate-questions --scenario anaphylaxis --lang en
```

**Expected volume:** 3 active seeded scenarios × 6 rubric items × 2 languages = **36 drafts** in total, fewer if
some are rejected. Each needs your review.

Per rubric item and language, in this order:
1. **Generator call:** may use only the rubric item text plus your `reference_notes`. It asks for 4 options, one best
   answer, and an explanation citing the rubric id. Korean is written from the Korean sources, not translated.
2. **JSON schema check:** exact keys, 4 distinct options, index 0–3, lengths, no "all/none of the above".
3. **Deterministic source guard:** every number in the stem, options or explanation must appear in the sources (no
   invented doses, rates or times); no links; the explanation cites the rubric id.
4. **Duplicate check:** character-trigram similarity ≥ 0.75 against this run and against
   `scripts/questions/approved_stems.json`, if you keep one.
5. **Independent validator call:** is the key consistent with the source, is exactly one option correct, are there any
   unsupported facts. Anything other than an explicit pass is a rejection.
6. **Shuffle:** options are shuffled and given ids `a`–`d`. A rejected attempt is retried once.

**Output:**
- `scripts/questions/questions_draft.sql`: drafts only, idempotent, with a commented approval template.
- `scripts/questions/questions_rejected.json`: every rejection with its reason.

Both files are git-ignored. Review the SQL, run it in the SQL Editor, then approve only what you checked:

```sql
update public.questions set status = 'approved', reviewed_at = now() where status = 'draft' and id in ('...', '...');
-- later, to pull a bad one:
update public.questions set status = 'retired' where id = '...';
-- triage user reports:
select q.id, q.language, q.rubric_item_id, count(r.*), array_agg(r.reason) from public.question_reports r
  join public.questions q on q.id = r.question_id group by q.id order by count(r.*) desc;
```

**Safety boundary.** The wrapper runs Deno with `--allow-read/--allow-write=scripts/questions`, `--allow-net=<LLM host>`
and `--allow-env=LLM_API_KEY,LLM_BASE_URL,LLM_MODEL,LLM_VALIDATOR_MODEL`. The script refuses to start with broader
permissions. It holds no database credentials and cannot connect to the database. It prints only HTTP status codes for
provider errors, never response bodies or the key.

## 4. Client contract (for the KMP follow-up)

All endpoints are `POST /functions/v1/<name>` with the user's access token (`Authorization: Bearer …`) and a JSON body.
Unknown body keys → 400.

| Endpoint | Body | 200 response |
|---|---|---|
| `start_session` | `{scenario_id, language}` | `{session_id, scenario_id, language, mode: "chat"│"sim", max_turns, turn_count: 0, status: "active"}` |
| `chat` (SSE) | `{session_id, messages, mode?, difficulty?, trainee_role?, triage_system?, ai_role?}` | `data: {delta}` … then `data: {done: true, remaining, limit, turn_count, max_turns, status}` |
| `grade` | `{session_id, messages}` | `{score, items: [{id, passed, note, tags}], feedback, session: {id, status, end_reason, turn_count, max_turns, score, missed_rubric_ids}}`; `already_graded: true` (and `feedback: null`) on a repeat |
| `get_questions` | `{session_id}` | `{questions: [{id, type, stem, options: [{id, text}], skill_tag, rubric_item_id, difficulty, language, label, reason}], skippable, missed_rubric_ids, missed_come_back_at, label}` |
| `answer_question` | `{question_id, selected_ids: ["b"], context: "debrief"│"review"}` | `{correct, correct_option_ids, explanation, interval_days, next_due_at}` |
| `review_queue` | `{}` | `{questions: [...same shape, no reason], due_today, due_total, weakest_skills: [{skill_tag, attempts, misses}], streak: {current, today_counts}}` |
| `report_question` | `{question_id, reason?}` (≤ 280 chars) | `{ok: true}` |

Error → UI:

| Error | Meaning | Client behaviour |
|---|---|---|
| `409 session_ended` `{status, end_reason}` | The session is over | Show "Session complete", disable the input, offer Finish & score |
| `409 not_gradeable` `{session}` | Too few turns to grade | Show the summary without a score |
| `409 not_graded` | `get_questions` before `grade` | Run `grade` first |
| `409 answer_conflict` | A double tap lost the race | Refetch, no error toast |
| `404 not_found` | Missing, or another user's session or question | Treat as missing |
| `429 rate_limited` / `daily_limit` | Rate limit or daily quota hit | Show the limit message |
| no network | Offline | Show the friendly offline message (questions need the network) |

The client may read these directly through RLS (own rows only):
- `sessions`: history, `score`, `end_reason`;
- `skill_stats`: Progress bars (attempts per tag; show the empty state "Do 3 scenarios to see your profile" until 3
  graded sessions exist);
- `activity_days`;
- `question_progress`.

The client calls the RPC `set_timezone('<IANA zone>')` after sign-in and when the device zone changes. Show
`label` ("Practice question. Check official guidelines.") on every question card, and a "Report a problem" control
that calls `report_question`.
