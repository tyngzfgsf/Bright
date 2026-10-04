-- Sessions: RLS and ownership with two different users. Run via scripts/run-sql-tests.sh (migrations + seeds applied).
-- Each check raises on failure, so a non-zero exit means a failed test. Everything is rolled back at the end.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('aaaaaaaa-0000-4000-8000-00000000000a'), ('bbbbbbbb-0000-4000-8000-00000000000b');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.expect_denied(q text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate = '42501' then return; end if;
    raise exception 'wrong error for [%]: % %', q, sqlstate, sqlerrm;
  end;
  raise exception 'EXPECTED DENIED but succeeded: %', q;
end $$;

create function pg_temp.expect_error(q text, want_state text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate = want_state then return; end if;
    raise exception 'wrong error for [%]: % % (wanted %)', q, sqlstate, sqlerrm, want_state;
  end;
  raise exception 'EXPECTED ERROR % but succeeded: %', want_state, q;
end $$;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
end $$;

-- ===== structure: RLS on EVERY public table; sessions has exactly one policy and it is a select-own
select pg_temp.assert_eq('RLS on every public table',
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint);
select pg_temp.assert_eq('sessions policies', (select count(*) from pg_policies where tablename = 'sessions'), 1::bigint);
select pg_temp.assert_eq('sessions policy is select-only', (select cmd from pg_policies where tablename = 'sessions'), 'SELECT');
select pg_temp.assert_eq('session columns',
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_name = 'sessions' and table_schema = 'public'),
  array['id','user_id','scenario_id','state','turn_count','status','started_at','updated_at','turn_lock_until',
        'language','max_turns','last_activity_at','ended_at','end_reason','graded_at','score','missed_rubric_ids']);

-- ===== setup as the Edge Functions do (service_role via the SECURITY DEFINER functions)
create temp table ids (name text primary key, id uuid);
grant all on ids to public;
set local role service_role;
insert into ids select 'scenario', id from public.scenarios where slug = 'anaphylaxis-sim' and language = 'en';
insert into ids select 'A1', public.create_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'scenario'), '{"v":1,"hr":118}'::jsonb, 'en', 14);
insert into ids select 'A2', public.create_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'scenario'), '{"v":1,"hr":99}'::jsonb, 'en', 14);
insert into ids select 'B1', public.create_session('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'scenario'), '{"v":1,"hr":77}'::jsonb, 'en', 14);
reset role;
select pg_temp.assert_eq('scenario seeded (inactive worked example)', (select active from public.scenarios s join ids on ids.id = s.id and ids.name = 'scenario'), false);

-- ===== user A: reads only own rows, writes nothing
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.assert_eq('A sees only own sessions', (select count(*) from public.sessions), 2::bigint);
select pg_temp.assert_eq('A sees none of B', (select count(*) from public.sessions where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint);
select pg_temp.assert_eq('A cannot fetch B session by id', (select count(*) from public.sessions where id = (select id from ids where name = 'B1')), 0::bigint);
select pg_temp.assert_eq('A reads own state', (select state ->> 'hr' from public.sessions where id = (select id from ids where name = 'A1')), '118');
select pg_temp.expect_denied($$insert into public.sessions (user_id, scenario_id, state) values (auth.uid(), (select id from ids where name = 'scenario'), '{}')$$);
select pg_temp.expect_denied($$insert into public.sessions (user_id, scenario_id, state) values ('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'scenario'), '{}')$$);
select pg_temp.expect_denied($$update public.sessions set state = '{"v":1,"hr":1}'$$);
select pg_temp.expect_denied($$update public.sessions set status = 'completed'$$);
select pg_temp.expect_denied($$update public.sessions set turn_count = 0$$);
select pg_temp.expect_denied($$update public.sessions set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$);
select pg_temp.expect_denied($$delete from public.sessions$$);
-- the engine config is server-only: sim is not a readable column, nor reachable through the listing view
select pg_temp.expect_denied($$select sim from public.scenarios$$);
select pg_temp.expect_denied($$select * from public.scenarios$$);
select pg_temp.assert_eq('scenario_list still exposes 4 columns', (select count(*) from information_schema.columns where table_name = 'scenario_list'), 4::bigint);
-- no client can call any of the session functions
select pg_temp.expect_denied($$select public.create_session(auth.uid(), (select id from ids where name = 'scenario'), '{}', 'en', 14)$$);
select pg_temp.expect_denied($$select * from public.get_session(auth.uid(), (select id from ids where name = 'A1'))$$);
select pg_temp.expect_denied($$select public.claim_session_turn(auth.uid(), (select id from ids where name = 'A1'), 0)$$);
select pg_temp.expect_denied($$select public.commit_session_turn(auth.uid(), (select id from ids where name = 'A1'), 0, '{}', 'active')$$);
select pg_temp.expect_denied($$select public.release_session_turn(auth.uid(), (select id from ids where name = 'A1'))$$);
select pg_temp.expect_denied($$select public.end_session(auth.uid(), (select id from ids where name = 'A1'))$$);
reset role;

-- ===== user B: sees only own
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.assert_eq('B sees only own sessions', (select count(*) from public.sessions), 1::bigint);
select pg_temp.assert_eq('B reads own state', (select state ->> 'hr' from public.sessions), '77');
select pg_temp.expect_denied($$update public.sessions set state = '{"v":1,"hr":1}' where user_id = auth.uid()$$);
reset role;

-- ===== anon: nothing
set local role anon;
select pg_temp.expect_denied($$select * from public.sessions$$);
select pg_temp.expect_denied($$select public.get_session('aaaaaaaa-0000-4000-8000-00000000000a', gen_random_uuid(), now())$$);
reset role;

-- ===== ownership inside the SECURITY DEFINER functions: user B's id can never touch user A's session
set local role service_role;
select pg_temp.assert_eq('get_session: owner', (select count(*) from public.get_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'))), 1::bigint);
select pg_temp.assert_eq('get_session: other user gets nothing', (select count(*) from public.get_session('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'A1'))), 0::bigint);
select pg_temp.assert_eq('claim: other user refused', public.claim_session_turn('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'A1'), 0), false);
select pg_temp.assert_eq('commit: other user refused', public.commit_session_turn('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'A1'), 0, '{"v":1,"hr":1}', 'active'), false);
select pg_temp.assert_eq('end: other user gets null', public.end_session('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'A1')), null::text);
-- A's owner-held lock is not released by B
select pg_temp.assert_eq('A claims', public.claim_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A2'), 0), true);
select public.release_session_turn('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'A2'));
select pg_temp.assert_eq('B cannot release A lock', (select turn_lock_until is not null from public.sessions where id = (select id from ids where name = 'A2')), true);
select public.release_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A2'));
select pg_temp.assert_eq('owner releases', (select turn_lock_until is null from public.sessions where id = (select id from ids where name = 'A2')), true);
-- A1 is exactly as created
select pg_temp.assert_eq('A1 untouched', (select state::text || turn_count::text || status from public.sessions where id = (select id from ids where name = 'A1')), '{"v": 1, "hr": 118}0active');

-- ===== turn lifecycle: claim -> (second claim refused) -> commit is compare-and-swap -> turn_count counts committed turns
select pg_temp.assert_eq('claim wrong expected refused', public.claim_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 5), false);
select pg_temp.assert_eq('claim ok', public.claim_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 0), true);
select pg_temp.assert_eq('second claim refused while locked', public.claim_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 0), false);
select pg_temp.assert_eq('commit bad status refused', public.commit_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 0, '{}', 'abandoned'), false);
select pg_temp.assert_eq('commit wrong expected refused', public.commit_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 3, '{}', 'active'), false);
select pg_temp.assert_eq('commit ok', public.commit_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 0, '{"v":1,"hr":120}', 'active'), true);
select pg_temp.assert_eq('turn_count bumped, lock dropped, state written',
  (select turn_count::text || (turn_lock_until is null)::text || (state ->> 'hr') from public.sessions where id = (select id from ids where name = 'A1')), '1true120');
select pg_temp.assert_eq('replayed commit (stale expected) refused', public.commit_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 0, '{"v":1,"hr":999}', 'active'), false);
update public.sessions set turn_lock_until = now() - interval '1 second' where id = (select id from ids where name = 'A1');
select pg_temp.assert_eq('stale lock expires by itself', public.claim_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 1), true);
select public.release_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'));
select pg_temp.assert_eq('end', public.end_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1')), 'completed');
select pg_temp.assert_eq('end idempotent', public.end_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1')), 'completed');
select pg_temp.assert_eq('no claim on a completed session', public.claim_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 1), false);
select pg_temp.assert_eq('no commit on a completed session', public.commit_session_turn('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'A1'), 1, '{}', 'active'), false);

-- ===== state-only storage and size guard (CHECK constraints)
select pg_temp.expect_error($$select public.create_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'scenario'), '"just a string"'::jsonb, 'en', 14)$$, '23514');
select pg_temp.expect_error($$select public.create_session('aaaaaaaa-0000-4000-8000-00000000000a', (select id from ids where name = 'scenario'), jsonb_build_object('pad', repeat(md5(random()::text), 2000)), 'en', 14)$$, '23514');

-- ===== at most 4 active sessions per user: the oldest are abandoned
do $$ declare i int; begin
  for i in 1..6 loop
    perform public.create_session('bbbbbbbb-0000-4000-8000-00000000000b', (select id from ids where name = 'scenario'), '{"v":1}'::jsonb, 'en', 14);
  end loop;
end $$;
select pg_temp.assert_eq('B active sessions capped at 4', (select count(*) from public.sessions where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and status = 'active'), 4::bigint);
select pg_temp.assert_eq('the rest are abandoned', (select count(*) from public.sessions where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and status = 'abandoned'), 3::bigint);
select pg_temp.assert_eq('A was not affected by B starting sessions', (select count(*) from public.sessions where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and status = 'active'), 1::bigint);
reset role;

-- ===== deleting a user removes their sessions (no orphaned state)
delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-00000000000b';
select pg_temp.assert_eq('sessions cascade with the user', (select count(*) from public.sessions where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint);

-- ===== rubric tags exist on every seeded rubric item (vocabulary: see functions/_shared/sim/rubric.ts)
select pg_temp.assert_eq('every rubric item has tags',
  (select count(*) from public.scenarios s, jsonb_array_elements(s.rubric) i
    where jsonb_typeof(i -> 'tags') is distinct from 'array' or jsonb_array_length(i -> 'tags') = 0), 0::bigint);
select pg_temp.assert_eq('only vocabulary tags',
  (select count(*) from public.scenarios s, jsonb_array_elements(s.rubric) i, jsonb_array_elements_text(i -> 'tags') t
    where t not in ('airway','breathing','circulation','assessment','medication','communication','escalation','safety')), 0::bigint);

rollback;
\echo 'ALL SESSIONS RLS/OWNERSHIP TESTS PASSED'
