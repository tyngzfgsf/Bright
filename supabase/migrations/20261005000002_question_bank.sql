-- Question bank (generated once offline, reviewed by a human, then reused), per-user spaced-repetition progress,
-- reports, the daily review queue and the streak. Questions are served only through Edge Functions, only when
-- status = 'approved', and never with their answer key before the user has answered.
--
-- Format-neutral on purpose: a question is structured data (stem, options with stable ids, key, explanation), not
-- rendered text, so a printable/PDF renderer can be added later without changing the data. Question ids are stable.

-- ---------------------------------------------------------------- questions (server-side only)
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  rubric_item_id text not null check (rubric_item_id ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  skill_tag text not null check (skill_tag in
    ('airway', 'breathing', 'circulation', 'assessment', 'medication', 'communication', 'escalation', 'safety')),
  language text not null check (language in ('ko', 'en')),
  type text not null default 'mcq' check (type in ('mcq', 'ordering', 'short')),
  stem text not null check (length(stem) between 10 and 1000),
  -- [{ "id": "a", "text": "..." }, ...]
  options jsonb not null,
  -- ["c"]
  correct_option_ids jsonb not null,
  explanation text not null check (length(explanation) between 10 and 1500),
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  source text not null default 'ai' check (source in ('ai', 'manual')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint questions_options_array check (jsonb_typeof(options) = 'array' and jsonb_typeof(correct_option_ids) = 'array'),
  -- Only mcq is served today: exactly 4 options with unique short ids and non-empty text, exactly one correct id
  -- that is one of the options. (ordering/short get their own checks when they are added.)
  constraint questions_mcq_shape check (type <> 'mcq' or (
    jsonb_array_length(options) = 4
    and jsonb_array_length(correct_option_ids) = 1
    and options @> jsonb_build_array(jsonb_build_object('id', correct_option_ids ->> 0))
  )),
  -- Nothing is approved without a review timestamp.
  constraint questions_approved_reviewed check (status <> 'approved' or reviewed_at is not null)
);
create index questions_serve_idx on public.questions (language, status, scenario_id);
create index questions_skill_idx on public.questions (language, status, skill_tag);
alter table public.questions enable row level security;

-- Option ids must be unique, short and every option needs text. A trigger, because CHECK cannot use subqueries.
create or replace function public.questions_validate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from jsonb_array_elements(new.options) o
              where jsonb_typeof(o) <> 'object'
                 or coalesce(o ->> 'id', '') !~ '^[a-z0-9]{1,8}$'
                 or length(coalesce(o ->> 'text', '')) not between 1 and 300)
     or (select count(distinct o ->> 'id') from jsonb_array_elements(new.options) o) <> jsonb_array_length(new.options)
  then
    raise exception 'question %: options must be {id,text} with unique ids', new.id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger questions_validate before insert or update on public.questions
  for each row execute function public.questions_validate();

-- RLS on and NO policies: no client role can read or write questions. They leave the database only through the
-- service_role functions below, which strip the key.
revoke all on public.questions from anon, authenticated;
grant all on public.questions to service_role;

-- ---------------------------------------------------------------- reports ("Report a problem")
create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  reason text check (reason is null or length(reason) <= 280),
  created_at timestamptz not null default now()
);
create index question_reports_question_idx on public.question_reports (question_id, created_at desc);
alter table public.question_reports enable row level security;
create policy question_reports_select_own on public.question_reports
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.question_reports from anon, authenticated;
grant select on public.question_reports to authenticated;
grant all on public.question_reports to service_role;

-- ---------------------------------------------------------------- per-user spaced-repetition progress
create table public.question_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  ease numeric(4, 2) not null default 2.5 check (ease between 1.3 and 3.0),
  interval_days int not null default 0 check (interval_days between 0 and 180),
  due_at timestamptz not null,
  attempts int not null default 0 check (attempts >= 0),
  correct_streak int not null default 0 check (correct_streak >= 0),
  last_answered_at timestamptz,
  primary key (user_id, question_id)
);
create index question_progress_due_idx on public.question_progress (user_id, due_at);
alter table public.question_progress enable row level security;
create policy question_progress_select_own on public.question_progress
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.question_progress from anon, authenticated;
grant select on public.question_progress to authenticated;
grant all on public.question_progress to service_role;

-- ---------------------------------------------------------------- RPCs (service_role only, all filtered by p_user)

-- End of the user's local day, as an instant. "Due today" means due_at < this.
create or replace function public.local_day_end(p_user uuid, p_now timestamptz default now())
returns timestamptz language sql stable security definer set search_path = '' as $$
  select ((public.local_day(p_user, p_now) + 1)::timestamp at time zone public.user_tz(p_user))
$$;

-- Approved questions in one language, WITHOUT correct_option_ids or explanation, plus the caller's progress.
-- This (and review_due) is the only way questions reach a client. Draft and retired rows are never returned.
create or replace function public.question_candidates(p_user uuid, p_language text)
returns table (id uuid, scenario_id uuid, rubric_item_id text, skill_tag text, language text, type text, stem text,
               options jsonb, difficulty smallint, attempts int, last_answered_at timestamptz, due_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.id, q.scenario_id, q.rubric_item_id, q.skill_tag, q.language, q.type, q.stem, q.options, q.difficulty,
         coalesce(p.attempts, 0), p.last_answered_at, p.due_at
    from public.questions q
    left join public.question_progress p on p.question_id = q.id and p.user_id = p_user
   where q.status = 'approved' and q.language = p_language and q.type = 'mcq'
   order by q.id
   limit 1000
$$;

-- The answer key, for server-side checking only, plus the caller's progress for scheduling. Approved only.
create or replace function public.question_for_answer(p_user uuid, p_id uuid)
returns table (id uuid, skill_tag text, type text, options jsonb, correct_option_ids jsonb, explanation text,
               ease numeric, interval_days int, attempts int, correct_streak int)
language sql stable security definer set search_path = '' as $$
  select q.id, q.skill_tag, q.type, q.options, q.correct_option_ids, q.explanation,
         p.ease, p.interval_days, coalesce(p.attempts, 0), coalesce(p.correct_streak, 0)
    from public.questions q
    left join public.question_progress p on p.question_id = q.id and p.user_id = p_user
   where q.id = p_id and q.status = 'approved'
$$;

-- Puts questions into the user's review queue (due at p_due) without touching ones already there.
create or replace function public.enroll_questions(p_user uuid, p_ids uuid[], p_due timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into public.question_progress (user_id, question_id, due_at)
  select p_user, q.id, p_due from public.questions q where q.id = any (p_ids) and q.status = 'approved'
  on conflict (user_id, question_id) do nothing
$$;

-- Records one answer. The schedule (ease/interval/due) is computed by the pure TS scheduler; correctness was decided
-- server-side against the key. Compare-and-swap on attempts, so two parallel answers cannot both apply.
-- Returns false on a lost race (nothing written).
create or replace function public.record_answer(
  p_user uuid, p_question uuid, p_skill text, p_correct boolean, p_ease numeric, p_interval int,
  p_streak int, p_expected_attempts int, p_context text, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_day date := public.local_day(p_user, p_now);
  v_left int;
  v_reviews int;
begin
  if p_context not in ('debrief', 'review') then raise exception 'bad context' using errcode = '22023'; end if;

  insert into public.question_progress as p
    (user_id, question_id, ease, interval_days, due_at, attempts, correct_streak, last_answered_at)
  values (p_user, p_question, p_ease, p_interval, p_now + make_interval(days => p_interval), 1, p_streak, p_now)
  on conflict (user_id, question_id) do update
    set ease = excluded.ease, interval_days = excluded.interval_days, due_at = excluded.due_at,
        attempts = p.attempts + 1, correct_streak = excluded.correct_streak, last_answered_at = p_now
    where p.attempts = p_expected_attempts;
  if not found then return false; end if;
  -- A fresh insert is only valid when the caller expected no previous attempts.
  if p_expected_attempts <> 0 and (select attempts from public.question_progress
                                    where user_id = p_user and question_id = p_question) = 1 then
    raise exception 'stale progress' using errcode = '40001';
  end if;

  insert into public.skill_stats as k (user_id, skill_tag, attempts, misses, last_missed_at)
  values (p_user, p_skill, 1, case when p_correct then 0 else 1 end, case when p_correct then null else p_now end)
  on conflict (user_id, skill_tag) do update
    set attempts = k.attempts + 1,
        misses = k.misses + case when p_correct then 0 else 1 end,
        last_missed_at = case when p_correct then k.last_missed_at else p_now end;

  insert into public.activity_days as a (user_id, day, questions_answered, reviews_answered)
  values (p_user, v_day, 1, case when p_context = 'review' then 1 else 0 end)
  on conflict (user_id, day) do update
    set questions_answered = a.questions_answered + 1,
        reviews_answered = a.reviews_answered + case when p_context = 'review' then 1 else 0 end
  returning reviews_answered into v_reviews;

  -- "Completed today's review": nothing approved is left due today, or the daily cap is reached.
  if p_context = 'review' then
    select count(*) into v_left
      from public.question_progress p join public.questions q on q.id = p.question_id and q.status = 'approved'
     where p.user_id = p_user and p.due_at < public.local_day_end(p_user, p_now);
    if v_left = 0 or v_reviews >= 10 then
      update public.activity_days set review_completed = true where user_id = p_user and day = v_day;
    end if;
  end if;
  return true;
end $$;

-- Today's review: approved questions due before the end of the user's local day, oldest first, capped at
-- 10 per day minus the reviews already answered today. No answer key.
create or replace function public.review_due(p_user uuid, p_now timestamptz default now())
returns table (id uuid, scenario_id uuid, rubric_item_id text, skill_tag text, language text, type text, stem text,
               options jsonb, difficulty smallint, attempts int, last_answered_at timestamptz, due_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.id, q.scenario_id, q.rubric_item_id, q.skill_tag, q.language, q.type, q.stem, q.options, q.difficulty,
         p.attempts, p.last_answered_at, p.due_at
    from public.question_progress p
    join public.questions q on q.id = p.question_id and q.status = 'approved'
   where p.user_id = p_user and p.due_at < public.local_day_end(p_user, p_now)
   order by p.due_at, q.id
   limit greatest(0, 10 - coalesce((select a.reviews_answered from public.activity_days a
                                     where a.user_id = p_user and a.day = public.local_day(p_user, p_now)), 0))
$$;

-- Total due today (uncapped), for "N due" displays.
create or replace function public.review_due_count(p_user uuid, p_now timestamptz default now())
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.question_progress p join public.questions q on q.id = p.question_id and q.status = 'approved'
   where p.user_id = p_user and p.due_at < public.local_day_end(p_user, p_now)
$$;

-- Streak in the user's own timezone. A day counts if a session was completed or that day's review was completed.
-- Today not counting (yet) does not break the streak: it is still alive until the local day ends.
create or replace function public.streak(p_user uuid, p_now timestamptz default now())
returns table (o_current int, o_today_counts boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.local_day(p_user, p_now);
  v_day date;
  v_n int := 0;
  v_today_counts boolean;
begin
  select exists (select 1 from public.activity_days
                  where user_id = p_user and day = v_today and (sessions_completed > 0 or review_completed))
    into v_today_counts;
  v_day := case when v_today_counts then v_today else v_today - 1 end;
  while v_n < 3660 and exists (select 1 from public.activity_days
                                where user_id = p_user and day = v_day and (sessions_completed > 0 or review_completed)) loop
    v_n := v_n + 1;
    v_day := v_day - 1;
  end loop;
  return query select v_n, v_today_counts;
end $$;

-- Weakest skill tags: highest miss rate first (ties: more misses, more recent miss).
create or replace function public.weakest_skills(p_user uuid, p_limit int default 3)
returns table (skill_tag text, attempts int, misses int)
language sql stable security definer set search_path = '' as $$
  select k.skill_tag, k.attempts, k.misses from public.skill_stats k
   where k.user_id = p_user and k.attempts > 0
   order by k.misses::numeric / k.attempts desc, k.misses desc, k.last_missed_at desc nulls last, k.skill_tag
   limit least(greatest(p_limit, 0), 8)
$$;

-- "Report a problem". Approved questions only (the only ones a user can have seen). Returns false if not found.
create or replace function public.report_question(p_user uuid, p_question uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.question_reports (user_id, question_id, reason)
  select p_user, q.id, nullif(left(btrim(coalesce(p_reason, '')), 280), '')
    from public.questions q where q.id = p_question and q.status = 'approved';
  return found;
end $$;

revoke all on function public.local_day_end(uuid, timestamptz), public.question_candidates(uuid, text),
  public.question_for_answer(uuid, uuid), public.enroll_questions(uuid, uuid[], timestamptz),
  public.record_answer(uuid, uuid, text, boolean, numeric, int, int, int, text, timestamptz),
  public.review_due(uuid, timestamptz), public.review_due_count(uuid, timestamptz), public.streak(uuid, timestamptz),
  public.weakest_skills(uuid, int), public.report_question(uuid, uuid, text), public.questions_validate()
  from public, anon, authenticated;
grant execute on function public.local_day_end(uuid, timestamptz), public.question_candidates(uuid, text),
  public.question_for_answer(uuid, uuid), public.enroll_questions(uuid, uuid[], timestamptz),
  public.record_answer(uuid, uuid, text, boolean, numeric, int, int, int, text, timestamptz),
  public.review_due(uuid, timestamptz), public.review_due_count(uuid, timestamptz), public.streak(uuid, timestamptz),
  public.weakest_skills(uuid, int), public.report_question(uuid, uuid, text)
  to service_role;
