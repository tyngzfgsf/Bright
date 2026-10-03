-- Server-side simulation sessions + the server-only patient-state engine config.
-- Stores STATE ONLY (vitals, flags, action log). Message text is never stored server-side.
-- Clients may read their own rows; every write goes through the SECURITY DEFINER functions below,
-- which only service_role (the Edge Functions) can execute, and each of which filters on p_user.

-- ---------------------------------------------------------------- scenarios: engine config
-- initial_state, actions, rules, flag descriptions, opening line, medical-review marker.
-- Server-side only: authenticated has column-level SELECT on id/slug/language/title/active (migration
-- 20261003000002), so this new column is unreadable to clients without any further grant.
alter table public.scenarios add column sim jsonb;
alter table public.scenarios add constraint scenarios_sim_is_object
  check (sim is null or jsonb_typeof(sim) = 'object');

-- ---------------------------------------------------------------- sessions
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  state jsonb not null,
  turn_count int not null default 0 check (turn_count >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Internal: set while a turn is in flight so a second turn on the same session cannot run from the same state.
  -- Expires by itself, so a crashed function never leaves a session stuck.
  turn_lock_until timestamptz,
  constraint sessions_state_is_small_object check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 32768)
);
create index sessions_user_status_idx on public.sessions (user_id, status, updated_at desc);
alter table public.sessions enable row level security;

create policy sessions_select_own on public.sessions
  for select to authenticated using (user_id = (select auth.uid()));

-- Supabase grants broad default privileges; strip them. Clients get SELECT (RLS: own rows) and nothing else.
revoke all on public.sessions from anon, authenticated;
grant select on public.sessions to authenticated;
grant all on public.sessions to service_role;

create or replace function public.sessions_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger sessions_touch before update on public.sessions
  for each row execute function public.sessions_touch();

-- ---------------------------------------------------------------- RPCs (service_role only, all filtered by p_user)
-- Starts a session. At most 4 stay active per user: starting another abandons the least recently used.
create or replace function public.create_session(p_user uuid, p_scenario uuid, p_state jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  update public.sessions set status = 'abandoned'
   where id in (select id from public.sessions
                 where user_id = p_user and status = 'active'
                 order by updated_at desc, started_at desc offset 3); -- keep the 3 newest; the new one makes 4
  insert into public.sessions (user_id, scenario_id, state) values (p_user, p_scenario, p_state)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_session(p_user uuid, p_id uuid)
returns setof public.sessions language sql stable security definer set search_path = '' as $$
  select * from public.sessions where id = p_id and user_id = p_user
$$;

-- Takes the turn lock (60 s, self-expiring) if the session is active, is at the expected committed turn_count and is
-- not already locked. Exactly one of several parallel turns wins.
create or replace function public.claim_session_turn(p_user uuid, p_id uuid, p_expected int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sessions set turn_lock_until = now() + interval '60 seconds'
   where id = p_id and user_id = p_user and status = 'active' and turn_count = p_expected
     and (turn_lock_until is null or turn_lock_until < now());
  return found;
end $$;

-- Commits a turn: new state, turn_count + 1, lock released. Compare-and-swap on the committed turn_count.
create or replace function public.commit_session_turn(p_user uuid, p_id uuid, p_expected int, p_state jsonb, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('active', 'completed') then return false; end if;
  update public.sessions
     set state = p_state, status = p_status, turn_count = turn_count + 1, turn_lock_until = null
   where id = p_id and user_id = p_user and status = 'active' and turn_count = p_expected;
  return found;
end $$;

-- Gives the lock back (the turn failed before anything was committed).
create or replace function public.release_session_turn(p_user uuid, p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.sessions set turn_lock_until = null where id = p_id and user_id = p_user
$$;

-- Marks an active session completed. Returns its resulting status, or null if it is not the caller's.
create or replace function public.end_session(p_user uuid, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  update public.sessions set status = 'completed'
   where id = p_id and user_id = p_user and status = 'active';
  select status into v_status from public.sessions where id = p_id and user_id = p_user;
  return v_status;
end $$;

revoke all on function public.create_session(uuid, uuid, jsonb), public.get_session(uuid, uuid),
  public.claim_session_turn(uuid, uuid, int), public.commit_session_turn(uuid, uuid, int, jsonb, text),
  public.release_session_turn(uuid, uuid), public.end_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_session(uuid, uuid, jsonb), public.get_session(uuid, uuid),
  public.claim_session_turn(uuid, uuid, int), public.commit_session_turn(uuid, uuid, int, jsonb, text),
  public.release_session_turn(uuid, uuid), public.end_session(uuid, uuid)
  to service_role;
