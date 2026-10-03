-- Bright backend schema. RLS is ON for every table; clients get only the grants below.
-- Day boundaries use Asia/Seoul so the daily quota resets at local midnight for the main audience.

create or replace function public.bright_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.bright_next_reset() returns timestamptz
language sql stable as $$
  select (((now() at time zone 'Asia/Seoul')::date + 1)::timestamp at time zone 'Asia/Seoul')
$$;

-- ---------------------------------------------------------------- tiers
create table public.tiers (
  name text primary key,
  daily_message_limit int not null check (daily_message_limit >= 0),
  chat_model text not null,
  grade_model text not null,
  max_output_tokens int not null check (max_output_tokens between 1 and 4096)
);
alter table public.tiers enable row level security;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' references public.tiers (name),
  age_confirmed boolean not null default false,
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- scenarios (server-side only)
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  language text not null check (language in ('ko', 'en')),
  title text not null,
  system_prompt text not null,
  -- [{ "id": "CPR-START", "text": "...", "points": 2 }, ...]
  rubric jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  unique (slug, language)
);
alter table public.scenarios enable row level security;

-- Clients may list id/slug/language/title only. Owned by the migration role, so it reads the
-- RLS-protected table on the caller's behalf (security_invoker is deliberately off).
create view public.scenario_list with (security_invoker = false) as
  select id, slug, language, title from public.scenarios where active;

-- ---------------------------------------------------------------- usage
create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages int not null default 0 check (messages >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  primary key (user_id, day)
);
alter table public.usage_daily enable row level security;

create table public.global_usage_daily (
  day date primary key,
  cost_usd numeric(12, 6) not null default 0
);
alter table public.global_usage_daily enable row level security;

create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket)
);
alter table public.rate_limits enable row level security;

-- Prices, limits, etc. editable without redeploying anything.
create table public.app_config (
  key text primary key,
  value jsonb not null
);
alter table public.app_config enable row level security;

-- ---------------------------------------------------------------- RLS policies (read-own only)
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy usage_daily_select_own on public.usage_daily
  for select to authenticated using (user_id = (select auth.uid()));

create policy tiers_select_all on public.tiers
  for select to authenticated using (true);

-- scenarios, global_usage_daily, rate_limits, app_config: RLS on, NO policies => unreadable to clients.

-- ---------------------------------------------------------------- grants
-- Supabase grants broad default privileges; strip them, then add back the minimum.
revoke all on public.tiers, public.profiles, public.scenarios, public.usage_daily,
  public.global_usage_daily, public.rate_limits, public.app_config
  from anon, authenticated;
revoke all on public.scenario_list from anon;

grant select on public.profiles, public.usage_daily, public.tiers to authenticated;
grant select on public.scenario_list to authenticated;
-- No insert/update/delete for any client role anywhere: `tier` cannot be changed by users.

grant all on public.tiers, public.profiles, public.scenarios, public.usage_daily,
  public.global_usage_daily, public.rate_limits, public.app_config to service_role;

-- ---------------------------------------------------------------- RPCs
-- The only client-callable write: the user confirms they meet the minimum age. Cannot touch tier.
create or replace function public.confirm_age() returns void
language sql security definer set search_path = '' as $$
  update public.profiles
     set age_confirmed = true, age_confirmed_at = coalesce(age_confirmed_at, now())
   where id = auth.uid();
$$;
revoke all on function public.confirm_age() from public, anon;
grant execute on function public.confirm_age() to authenticated;

-- Atomic quota check + increment. One statement decides, so parallel requests cannot both pass.
create or replace function public.consume_quota(p_user uuid, p_n int)
returns table (o_allowed boolean, o_remaining int, o_limit int, o_day date, o_resets_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int;
  v_day date := public.bright_today();
  v_used int;
begin
  select t.daily_message_limit into v_limit
    from public.profiles p join public.tiers t on t.name = p.tier
   where p.id = p_user;
  if v_limit is null then
    return query select false, 0, 0, v_day, public.bright_next_reset();
    return;
  end if;

  if p_n <= v_limit then
    insert into public.usage_daily as u (user_id, day, messages)
    values (p_user, v_day, p_n)
    on conflict (user_id, day) do update
      set messages = u.messages + p_n
      where u.messages + p_n <= v_limit
    returning u.messages into v_used;
  end if;

  if v_used is null then
    select coalesce(u.messages, 0) into v_used
      from (select 1) x left join public.usage_daily u on u.user_id = p_user and u.day = v_day;
    return query select false, greatest(v_limit - v_used, 0), v_limit, v_day, public.bright_next_reset();
  else
    return query select true, v_limit - v_used, v_limit, v_day, public.bright_next_reset();
  end if;
end $$;

create or replace function public.refund_quota(p_user uuid, p_n int, p_day date)
returns void language sql security definer set search_path = '' as $$
  update public.usage_daily set messages = greatest(messages - p_n, 0)
   where user_id = p_user and day = p_day;
$$;

create or replace function public.record_usage(p_user uuid, p_in bigint, p_out bigint, p_cost numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_day date := public.bright_today();
begin
  insert into public.usage_daily as u (user_id, day, input_tokens, output_tokens, cost_usd)
  values (p_user, v_day, p_in, p_out, p_cost)
  on conflict (user_id, day) do update
    set input_tokens = u.input_tokens + p_in,
        output_tokens = u.output_tokens + p_out,
        cost_usd = u.cost_usd + p_cost;
  insert into public.global_usage_daily as g (day, cost_usd) values (v_day, p_cost)
  on conflict (day) do update set cost_usd = g.cost_usd + p_cost;
end $$;

-- Fixed one-minute window. Returns true if the request is within p_max.
create or replace function public.check_rate_limit(p_user uuid, p_max int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits int;
begin
  delete from public.rate_limits where user_id = p_user and bucket < now() - interval '1 hour';
  insert into public.rate_limits as r (user_id, bucket, hits)
  values (p_user, date_trunc('minute', now()), 1)
  on conflict (user_id, bucket) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return v_hits <= p_max;
end $$;

create or replace function public.get_global_cost() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select cost_usd from public.global_usage_daily where day = public.bright_today()), 0)
$$;

revoke all on function public.consume_quota(uuid, int), public.refund_quota(uuid, int, date),
  public.record_usage(uuid, bigint, bigint, numeric), public.check_rate_limit(uuid, int),
  public.get_global_cost() from public, anon, authenticated;
grant execute on function public.consume_quota(uuid, int), public.refund_quota(uuid, int, date),
  public.record_usage(uuid, bigint, bigint, numeric), public.check_rate_limit(uuid, int),
  public.get_global_cost() to service_role;

-- ---------------------------------------------------------------- seed config (editable later)
insert into public.tiers (name, daily_message_limit, chat_model, grade_model, max_output_tokens) values
  ('free', 15,  'openai/gpt-oss-20b', 'openai/gpt-oss-20b',  700),
  ('pro',  50,  'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 700),
  ('plus', 150, 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 900);

-- Placeholder prices (USD per 1M tokens); a later migration replaces them with provider-neutral config.
insert into public.app_config (key, value) values
  ('prices', '{
     "openai/gpt-oss-20b":  {"input": 0.075, "cached_input": 0.0375, "output": 0.30},
     "openai/gpt-oss-120b": {"input": 0.15,  "cached_input": 0.075,  "output": 0.60}
   }'::jsonb),
  ('rate_limit_per_minute', '6'::jsonb),
  ('reasoning_effort', '"low"'::jsonb);
