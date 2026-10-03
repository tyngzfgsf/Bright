-- Run: psql -v ON_ERROR_STOP=1 -f tests/rls_and_quota.sql   (after migrations + seed)
-- Each check raises an exception on failure, so a non-zero exit means a failed test.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.expect_denied(q text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when insufficient_privilege or others then
    if sqlstate in ('42501') then return; end if;
    raise exception 'wrong error for [%]: % %', q, sqlstate, sqlerrm;
  end;
  raise exception 'EXPECTED DENIED but succeeded: %', q;
end $$;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
end $$;

-- profiles were auto-created, default tier free, not age-confirmed
select pg_temp.assert_eq('profiles auto-created', (select count(*) from public.profiles where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')), 2::bigint);
select pg_temp.assert_eq('default tier', (select tier from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'free');

-- ===== user A
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.assert_eq('A sees only own profile', (select count(*) from public.profiles), 1::bigint);  -- RLS hides B and the race-test user
select pg_temp.assert_eq('A sees own id', (select id::text from public.profiles), '11111111-1111-4111-8111-111111111111');
select pg_temp.expect_denied($$update public.profiles set tier = 'plus' where id = auth.uid()$$);
select pg_temp.expect_denied($$update public.profiles set tier = 'plus'$$);
select pg_temp.expect_denied($$update public.profiles set age_confirmed = true where id = auth.uid()$$);
select pg_temp.expect_denied($$insert into public.profiles (id) values (gen_random_uuid())$$);
select pg_temp.expect_denied($$delete from public.profiles$$);
select pg_temp.expect_denied($$select * from public.scenarios$$);
select pg_temp.expect_denied($$select * from public.global_usage_daily$$);
select pg_temp.expect_denied($$select * from public.app_config$$);
select pg_temp.expect_denied($$select * from public.rate_limits$$);
select pg_temp.expect_denied($$insert into public.usage_daily (user_id, day) values (auth.uid(), current_date)$$);
select pg_temp.expect_denied($$update public.tiers set daily_message_limit = 9999$$);
select pg_temp.expect_denied($$select * from public.consume_quota(auth.uid(), 1)$$);
select pg_temp.expect_denied($$select public.record_usage(auth.uid(), 1, 1, 0)$$);
select pg_temp.expect_denied($$select public.get_global_cost()$$);
-- scenario_list exposes only id/slug/language/title
select pg_temp.assert_eq('scenario_list readable', (select count(*) > 0 from public.scenario_list), true);
select pg_temp.assert_eq('scenario_list columns', (select count(*) from information_schema.columns where table_name='scenario_list'), 4::bigint);
select pg_temp.assert_eq('tiers readable', (select count(*) >= 3 from public.tiers), true);
-- confirm_age affects only the caller, and cannot touch tier
select public.confirm_age();
select pg_temp.assert_eq('A confirmed', (select age_confirmed from public.profiles), true);
select pg_temp.assert_eq('A tier unchanged', (select tier from public.profiles), 'free');
reset role;
select pg_temp.assert_eq('B NOT confirmed by A', (select age_confirmed from public.profiles where id = '22222222-2222-4222-8222-222222222222'), false);

-- ===== anon
set local role anon;
select pg_temp.expect_denied($$select * from public.profiles$$);
select pg_temp.expect_denied($$select * from public.scenario_list$$);
select pg_temp.expect_denied($$select public.confirm_age()$$);
reset role;

-- ===== service role: quota RPCs
set local role service_role;
-- free tier = 15/day. Use B.
do $$ declare r record; i int; begin
  for i in 1..15 loop
    select * into r from public.consume_quota('22222222-2222-4222-8222-222222222222', 1);
    if not r.o_allowed then raise exception 'consume % should be allowed', i; end if;
  end loop;
  select * into r from public.consume_quota('22222222-2222-4222-8222-222222222222', 1);
  if r.o_allowed or r.o_remaining <> 0 then raise exception 'consume 16 must be denied'; end if;
  -- refund then allowed again
  perform public.refund_quota('22222222-2222-4222-8222-222222222222', 1, r.o_day);
  select * into r from public.consume_quota('22222222-2222-4222-8222-222222222222', 1);
  if not r.o_allowed then raise exception 'consume after refund should be allowed'; end if;
  -- a request bigger than the whole limit is refused even on a fresh user
  select * into r from public.consume_quota('11111111-1111-4111-8111-111111111111', 16);
  if r.o_allowed then raise exception 'p_n > limit must be denied'; end if;
  -- grade = 2
  select * into r from public.consume_quota('11111111-1111-4111-8111-111111111111', 2);
  if not r.o_allowed or r.o_remaining <> 13 then raise exception 'consume 2 failed: %', r; end if;
end $$;
select public.record_usage('11111111-1111-4111-8111-111111111111', 1000, 100, 0.0001);
select pg_temp.assert_eq('global cost', (select public.get_global_cost()), 0.000100::numeric);
-- rate limit: 6/min
do $$ declare ok int := 0; i int; begin
  for i in 1..9 loop if public.check_rate_limit('11111111-1111-4111-8111-111111111111', 6) then ok := ok + 1; end if; end loop;
  if ok <> 6 then raise exception 'rate limit allowed % (want 6)', ok; end if;
end $$;
reset role;

-- ===== A reads only own usage rows (B has rows too)
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.assert_eq('A sees only own usage', (select count(distinct user_id) from public.usage_daily), 1::bigint);
select pg_temp.assert_eq('A usage messages', (select messages from public.usage_daily), 2);
reset role;

rollback;
\echo 'ALL RLS/QUOTA TESTS PASSED'
