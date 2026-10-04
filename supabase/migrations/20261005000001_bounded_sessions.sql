-- Bounded sessions: every chat runs inside a server-side session that ends (Finish & score, turn cap, or 30 minutes of
-- inactivity) and is graded once. Extends the existing public.sessions table (20261004000001) instead of adding a
-- second one. Stores ids, counts, scores and timestamps only: never message text.
--
-- Every function that depends on the time takes p_now (default now()) so the SQL tests can pin the clock.

-- ---------------------------------------------------------------- scenarios: per-scenario turn cap (also a cost cap)
alter table public.scenarios add column max_turns int not null default 15
  constraint scenarios_max_turns_range check (max_turns between 1 and 60);

-- ---------------------------------------------------------------- sessions: lifecycle + grade summary
alter table public.sessions
  add column language text check (language in ('ko', 'en')),
  add column max_turns int not null default 15 constraint sessions_max_turns_range check (max_turns between 1 and 60),
  add column last_activity_at timestamptz not null default now(),
  add column ended_at timestamptz,
  add column end_reason text check (end_reason in ('finished', 'turn_cap', 'inactive', 'superseded', 'scenario')),
  add column graded_at timestamptz,
  add column score int check (score between 0 and 100),
  -- Rubric item ids the trainee missed (ids only; the grader's notes and feedback are never stored).
  add column missed_rubric_ids jsonb not null default '[]'::jsonb
    constraint sessions_missed_is_small_array check (jsonb_typeof(missed_rubric_ids) = 'array' and jsonb_array_length(missed_rubric_ids) <= 50);

update public.sessions s set language = sc.language from public.scenarios sc where sc.id = s.scenario_id and s.language is null;
update public.sessions set last_activity_at = updated_at;
update public.sessions set ended_at = updated_at where status <> 'active' and ended_at is null;

-- The session sim turns already check this; a session can never run past its cap.
alter table public.sessions add constraint sessions_turns_within_cap check (turn_count <= max_turns);

create index sessions_user_started_idx on public.sessions (user_id, started_at desc);

-- ---------------------------------------------------------------- profiles: the user's IANA timezone (for streak days)
-- null => Asia/Seoul, the same default bright_today() uses.
alter table public.profiles add column timezone text;

create or replace function public.user_tz(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.profiles where id = p_user), 'Asia/Seoul')
$$;

create or replace function public.local_day(p_user uuid, p_ts timestamptz) returns date
language sql stable security definer set search_path = '' as $$
  select (p_ts at time zone public.user_tz(p_user))::date
$$;

-- Client-callable (like confirm_age): sets the caller's own timezone. Validated against the server's tz database.
create or replace function public.set_timezone(p_tz text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_tz is null or length(p_tz) > 64 or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;
  update public.profiles set timezone = p_tz where id = auth.uid();
end $$;
revoke all on function public.set_timezone(text) from public, anon;
grant execute on function public.set_timezone(text) to authenticated;

-- ---------------------------------------------------------------- activity days (streaks) — created here so the
-- session trigger below can write to it; question answers add to it in 20261005000002.
create table public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sessions_completed int not null default 0 check (sessions_completed >= 0),
  questions_answered int not null default 0 check (questions_answered >= 0),
  -- Review answers only (debrief answers excluded): enforces the 10-a-day review cap.
  reviews_answered int not null default 0 check (reviews_answered >= 0),
  -- True once that day's review queue was emptied (or its cap reached). Counts toward the streak.
  review_completed boolean not null default false,
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;
create policy activity_days_select_own on public.activity_days
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.activity_days from anon, authenticated;
grant select on public.activity_days to authenticated;
grant all on public.activity_days to service_role;

-- skill_stats: per skill tag, fed by graded rubric items and by answered questions.
create table public.skill_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_tag text not null check (skill_tag in
    ('airway', 'breathing', 'circulation', 'assessment', 'medication', 'communication', 'escalation', 'safety')),
  attempts int not null default 0 check (attempts >= 0),
  misses int not null default 0 check (misses >= 0 and misses <= attempts),
  last_missed_at timestamptz,
  primary key (user_id, skill_tag)
);
alter table public.skill_stats enable row level security;
create policy skill_stats_select_own on public.skill_stats
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.skill_stats from anon, authenticated;
grant select on public.skill_stats to authenticated;
grant all on public.skill_stats to service_role;

-- A completed session (with at least one turn) counts toward that local day's streak. Abandoned ones do not.
create or replace function public.sessions_on_complete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status = 'active' and new.turn_count >= 1 then
    insert into public.activity_days as a (user_id, day, sessions_completed)
    values (new.user_id, public.local_day(new.user_id, coalesce(new.ended_at, now())), 1)
    on conflict (user_id, day) do update set sessions_completed = a.sessions_completed + 1;
  end if;
  return new;
end $$;
create trigger sessions_on_complete after update of status on public.sessions
  for each row execute function public.sessions_on_complete();

-- ---------------------------------------------------------------- session RPCs (service_role only, all filtered by p_user)
-- Inactivity: an active session untouched for 30 minutes becomes 'abandoned'. Applied lazily by every function that
-- reads or advances a session, so no cron job is needed and the client cannot keep a dead session alive.
create or replace function public.expire_idle_sessions(p_user uuid, p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.sessions
     set status = 'abandoned', end_reason = 'inactive', ended_at = last_activity_at + interval '30 minutes',
         turn_lock_until = null
   where user_id = p_user and status = 'active' and last_activity_at < p_now - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- Replaces create_session(uuid, uuid, jsonb): records language and the scenario's turn cap. Still keeps at most 4
-- active sessions per user (the oldest extra ones are 'superseded').
drop function public.create_session(uuid, uuid, jsonb);
create or replace function public.create_session(
  p_user uuid, p_scenario uuid, p_state jsonb, p_language text, p_max_turns int, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  perform public.expire_idle_sessions(p_user, p_now);
  update public.sessions set status = 'abandoned', end_reason = 'superseded', ended_at = p_now
   where id in (select id from public.sessions
                 where user_id = p_user and status = 'active'
                 order by last_activity_at desc, started_at desc offset 3); -- keep the 3 newest; the new one makes 4
  insert into public.sessions (user_id, scenario_id, state, language, max_turns, started_at, last_activity_at)
  values (p_user, p_scenario, p_state, p_language, p_max_turns, p_now, p_now)
  returning id into v_id;
  return v_id;
end $$;

-- Replaces get_session(uuid, uuid): applies the inactivity rule first, so the caller always sees the true status.
drop function public.get_session(uuid, uuid);
create or replace function public.get_session(p_user uuid, p_id uuid, p_now timestamptz default now())
returns setof public.sessions language plpgsql security definer set search_path = '' as $$
begin
  perform public.expire_idle_sessions(p_user, p_now);
  return query select * from public.sessions where id = p_id and user_id = p_user;
end $$;

-- One chat turn, decided by ONE statement: the session must be the caller's, active, not idle and under its cap.
-- The turn that reaches the cap completes the session (its reply is still delivered). Parallel requests cannot
-- push turn_count past max_turns.
create or replace function public.claim_chat_turn(p_user uuid, p_id uuid, p_now timestamptz default now())
returns table (o_ok boolean, o_reason text, o_turn_count int, o_max_turns int, o_status text)
language plpgsql security definer set search_path = '' as $$
declare r public.sessions;
begin
  perform public.expire_idle_sessions(p_user, p_now);
  update public.sessions s
     set turn_count = s.turn_count + 1,
         last_activity_at = p_now,
         status = case when s.turn_count + 1 >= s.max_turns then 'completed' else 'active' end,
         end_reason = case when s.turn_count + 1 >= s.max_turns then 'turn_cap' else null end,
         ended_at = case when s.turn_count + 1 >= s.max_turns then p_now else null end
   where s.id = p_id and s.user_id = p_user and s.status = 'active' and s.turn_count < s.max_turns
     and (s.turn_lock_until is null or s.turn_lock_until < p_now)
  returning s.* into r;
  if found then
    return query select true, null::text, r.turn_count, r.max_turns, r.status;
    return;
  end if;
  select * into r from public.sessions where id = p_id and user_id = p_user;
  if not found then
    return query select false, 'not_found'::text, 0, 0, null::text;
  elsif r.status = 'active' then
    return query select false, 'busy'::text, r.turn_count, r.max_turns, r.status;
  else
    return query select false, 'ended'::text, r.turn_count, r.max_turns, r.status;
  end if;
end $$;

-- Gives a claimed turn back when the LLM call failed before anything was delivered. Compare-and-swap on the
-- turn count it claimed, so it can only undo its own turn (and re-opens a session that the failed turn had capped).
create or replace function public.unclaim_chat_turn(p_user uuid, p_id uuid, p_turn_count int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sessions
     set turn_count = turn_count - 1, status = 'active', end_reason = null, ended_at = null
   where id = p_id and user_id = p_user and turn_count = p_turn_count and graded_at is null
     and (status = 'active' or (status = 'completed' and end_reason = 'turn_cap'));
  return found;
end $$;

-- Finish & score. Returns the resulting status, or null if the session is not the caller's.
create or replace function public.finish_session(p_user uuid, p_id uuid, p_now timestamptz default now())
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  perform public.expire_idle_sessions(p_user, p_now);
  update public.sessions set status = 'completed', end_reason = 'finished', ended_at = p_now, turn_lock_until = null
   where id = p_id and user_id = p_user and status = 'active';
  select status into v_status from public.sessions where id = p_id and user_id = p_user;
  return v_status;
end $$;

-- end_session (used by the sim endpoint's "end" action) now records how and when the session ended.
create or replace function public.end_session(p_user uuid, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  return public.finish_session(p_user, p_id, now());
end $$;

-- Sim turns also count as activity; a sim turn that ends the scenario records why.
create or replace function public.claim_session_turn(p_user uuid, p_id uuid, p_expected int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.expire_idle_sessions(p_user, now());
  update public.sessions set turn_lock_until = now() + interval '60 seconds', last_activity_at = now()
   where id = p_id and user_id = p_user and status = 'active' and turn_count = p_expected and turn_count < max_turns
     and (turn_lock_until is null or turn_lock_until < now());
  return found;
end $$;

create or replace function public.commit_session_turn(p_user uuid, p_id uuid, p_expected int, p_state jsonb, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('active', 'completed') then return false; end if;
  update public.sessions
     set state = p_state,
         turn_count = turn_count + 1,
         turn_lock_until = null,
         last_activity_at = now(),
         status = case when p_status = 'completed' or turn_count + 1 >= max_turns then 'completed' else 'active' end,
         end_reason = case when turn_count + 1 >= max_turns then 'turn_cap'
                           when p_status = 'completed' then 'scenario' else null end,
         ended_at = case when p_status = 'completed' or turn_count + 1 >= max_turns then now() else null end
   where id = p_id and user_id = p_user and status = 'active' and turn_count = p_expected;
  return found;
end $$;

-- Stores the grade summary once per session (ids and score only) and adds each rubric item to the skill profile.
-- p_items: [{ "id": "CA-CPR", "passed": true, "tags": ["circulation"] }, ...]. Returns false if already graded.
create or replace function public.record_grade(
  p_user uuid, p_id uuid, p_score int, p_items jsonb, p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_missed jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'bad items' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(e ->> 'id'), '[]'::jsonb) into v_missed
    from jsonb_array_elements(p_items) e where (e ->> 'passed')::boolean is false;
  update public.sessions set graded_at = p_now, score = p_score, missed_rubric_ids = v_missed
   where id = p_id and user_id = p_user and status <> 'active' and graded_at is null;
  if not found then return false; end if;

  insert into public.skill_stats as k (user_id, skill_tag, attempts, misses, last_missed_at)
  select p_user, t.tag, count(*), count(*) filter (where not t.passed),
         case when bool_or(not t.passed) then p_now end
    from (select tag, (e ->> 'passed')::boolean as passed
            from jsonb_array_elements(p_items) e, jsonb_array_elements_text(coalesce(e -> 'tags', '[]'::jsonb)) tag) t
   where t.tag in ('airway', 'breathing', 'circulation', 'assessment', 'medication', 'communication', 'escalation', 'safety')
   group by t.tag
  on conflict (user_id, skill_tag) do update
    set attempts = k.attempts + excluded.attempts,
        misses = k.misses + excluded.misses,
        last_missed_at = coalesce(excluded.last_missed_at, k.last_missed_at);
  return true;
end $$;

revoke all on function public.user_tz(uuid), public.local_day(uuid, timestamptz),
  public.expire_idle_sessions(uuid, timestamptz),
  public.create_session(uuid, uuid, jsonb, text, int, timestamptz), public.get_session(uuid, uuid, timestamptz),
  public.claim_chat_turn(uuid, uuid, timestamptz), public.unclaim_chat_turn(uuid, uuid, int),
  public.finish_session(uuid, uuid, timestamptz), public.record_grade(uuid, uuid, int, jsonb, timestamptz),
  public.sessions_on_complete()
  from public, anon, authenticated;
grant execute on function public.user_tz(uuid), public.local_day(uuid, timestamptz),
  public.expire_idle_sessions(uuid, timestamptz),
  public.create_session(uuid, uuid, jsonb, text, int, timestamptz), public.get_session(uuid, uuid, timestamptz),
  public.claim_chat_turn(uuid, uuid, timestamptz), public.unclaim_chat_turn(uuid, uuid, int),
  public.finish_session(uuid, uuid, timestamptz), public.record_grade(uuid, uuid, int, jsonb, timestamptz)
  to service_role;
-- create or replace keeps existing grants, but restate them for the replaced sim RPCs.
revoke all on function public.claim_session_turn(uuid, uuid, int), public.commit_session_turn(uuid, uuid, int, jsonb, text),
  public.end_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_session_turn(uuid, uuid, int), public.commit_session_turn(uuid, uuid, int, jsonb, text),
  public.end_session(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- rate limits: separate buckets per scope
-- 'llm' (chat, grade, sim, start_session) keeps rate_limit_per_minute; 'questions' (no LLM) gets its own, higher limit,
-- so answering questions never eats the chat budget and vice versa.
alter table public.rate_limits add column scope text not null default 'llm' check (scope in ('llm', 'questions'));
alter table public.rate_limits drop constraint rate_limits_pkey;
alter table public.rate_limits add primary key (user_id, scope, bucket);

create or replace function public.check_rate_limit(p_user uuid, p_max int, p_scope text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits int;
begin
  delete from public.rate_limits where user_id = p_user and bucket < now() - interval '1 hour';
  insert into public.rate_limits as r (user_id, scope, bucket, hits)
  values (p_user, p_scope, date_trunc('minute', now()), 1)
  on conflict (user_id, scope, bucket) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return v_hits <= p_max;
end $$;

-- The original two-argument form stays (same behaviour, 'llm' bucket) so nothing that calls it breaks.
create or replace function public.check_rate_limit(p_user uuid, p_max int)
returns boolean language sql security definer set search_path = '' as $$
  select public.check_rate_limit(p_user, p_max, 'llm')
$$;

revoke all on function public.check_rate_limit(uuid, int, text), public.check_rate_limit(uuid, int)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, int, text), public.check_rate_limit(uuid, int) to service_role;

insert into public.app_config (key, value) values ('questions_rate_limit_per_minute', '30'::jsonb)
on conflict (key) do nothing;
