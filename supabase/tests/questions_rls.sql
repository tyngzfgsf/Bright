-- Bounded sessions + question bank: RLS with two users, constraints, the turn cap and inactivity rule, streaks across
-- timezones and day boundaries, the review cap. Run via scripts/run-sql-tests.sh (migrations + seeds applied).
-- Each check raises on failure. Everything is rolled back at the end.
\set ON_ERROR_STOP on
begin;

\set A '''aaaaaaaa-1111-4000-8000-00000000000a'''
\set B '''bbbbbbbb-2222-4000-8000-00000000000b'''
insert into auth.users (id) values (:A), (:B);

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.expect_denied(q text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlstate = '42501' then return; end if;
    raise exception 'wrong error for [%]: % %', q, sqlstate, sqlerrm;
  end;
  raise exception 'EXPECTED DENIED but succeeded: %', q;
end $$;
create function pg_temp.expect_error(q text, want_state text) returns void language plpgsql as $$
begin
  begin execute q;
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

create temp table ids (name text primary key, id uuid);
grant all on ids to public;
insert into ids select 'scenario', id from public.scenarios where slug = 'cardiac-arrest' and language = 'en';
insert into ids select 'scenario_ko', id from public.scenarios where slug = 'cardiac-arrest' and language = 'ko';

-- ===== structure
select pg_temp.assert_eq('RLS on every public table',
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint);
select pg_temp.assert_eq('questions has no policies at all (clients cannot read it)',
  (select count(*) from pg_policies where tablename = 'questions'), 0::bigint);
select pg_temp.assert_eq('user tables have exactly one select-own policy each',
  (select count(*) from pg_policies where tablename in ('question_progress', 'skill_stats', 'activity_days', 'question_reports') and cmd = 'SELECT'), 4::bigint);
select pg_temp.assert_eq('no write policies on user tables',
  (select count(*) from pg_policies where tablename in ('question_progress', 'skill_stats', 'activity_days', 'question_reports', 'questions') and cmd <> 'SELECT'), 0::bigint);
select pg_temp.assert_eq('question_candidates never returns the key or explanation',
  pg_get_function_result('public.question_candidates(uuid,text)'::regprocedure) !~ '(correct|explanation)', true);
select pg_temp.assert_eq('review_due never returns the key or explanation',
  pg_get_function_result('public.review_due(uuid,timestamptz)'::regprocedure) !~ '(correct|explanation)', true);
select pg_temp.assert_eq('new tables hold no free text (only question_reports.reason, capped)',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('question_progress', 'skill_stats', 'activity_days')
      and data_type = 'text' and column_name not in ('skill_tag')), 0::bigint);

-- ===== question constraints (mcq shape, approval requires review, option ids)
create function pg_temp.q(p_status text, p_options jsonb, p_key jsonb, p_reviewed timestamptz) returns void language sql as $$
  insert into public.questions (scenario_id, rubric_item_id, skill_tag, language, stem, options, correct_option_ids, explanation, status, reviewed_at)
  values ((select id from ids where name = 'scenario'), 'CA-CPR', 'circulation', 'en', 'A valid question stem here?', p_options, p_key,
          'CA-CPR: explanation text.', p_status, p_reviewed)
$$;
\set OPTS '''[{"id":"a","text":"A"},{"id":"b","text":"B"},{"id":"c","text":"C"},{"id":"d","text":"D"}]'''
select pg_temp.expect_error($$select pg_temp.q('draft', '[{"id":"a","text":"A"},{"id":"b","text":"B"},{"id":"c","text":"C"}]', '["a"]', null)$$, '23514');
select pg_temp.expect_error(format($$select pg_temp.q('draft', %L, '["a","b"]', null)$$, :OPTS), '23514');
select pg_temp.expect_error(format($$select pg_temp.q('draft', %L, '["z"]', null)$$, :OPTS), '23514');
select pg_temp.expect_error(format($$select pg_temp.q('approved', %L, '["a"]', null)$$, :OPTS), '23514');
select pg_temp.expect_error($$select pg_temp.q('draft', '[{"id":"a","text":"A"},{"id":"a","text":"B"},{"id":"c","text":"C"},{"id":"d","text":"D"}]', '["a"]', null)$$, '23514');
select pg_temp.expect_error($$select pg_temp.q('draft', '[{"id":"a","text":""},{"id":"b","text":"B"},{"id":"c","text":"C"},{"id":"d","text":"D"}]', '["a"]', null)$$, '23514');
select pg_temp.expect_error($$insert into public.questions (scenario_id, rubric_item_id, skill_tag, language, stem, options, correct_option_ids, explanation)
  values ((select id from ids where name = 'scenario'), 'CA-CPR', 'cardiology', 'en', 'A valid question stem here?', '[]', '[]', 'x explanation')$$, '23514');
select pg_temp.assert_eq('draft is the default status',
  (select column_default from information_schema.columns where table_name = 'questions' and column_name = 'status'), '''draft''::text');

-- the bank used below: 1 approved per rubric item CA-CPR / CA-HELP (+1 approved in ko), plus a draft and a retired one
insert into public.questions (id, scenario_id, rubric_item_id, skill_tag, language, stem, options, correct_option_ids, explanation, status, reviewed_at, difficulty)
select v.id::uuid, (select id from ids where name = v.sc), v.rub, v.tag, v.lang, 'Which action comes first in this case?', :OPTS::jsonb, '["b"]',
       v.rub || ': explanation citing the rubric item.', v.st, case when v.st = 'approved' then now() end, 2
  from (values
    ('00000000-0000-4000-8000-0000000000a1', 'scenario',    'CA-CPR',  'circulation', 'en', 'approved'),
    ('00000000-0000-4000-8000-0000000000a2', 'scenario',    'CA-HELP', 'escalation',  'en', 'approved'),
    ('00000000-0000-4000-8000-0000000000a3', 'scenario',    'CA-CPR',  'circulation', 'en', 'draft'),
    ('00000000-0000-4000-8000-0000000000a4', 'scenario',    'CA-HELP', 'escalation',  'en', 'retired'),
    ('00000000-0000-4000-8000-0000000000a5', 'scenario_ko', 'CA-CPR',  'circulation', 'ko', 'approved')
  ) v(id, sc, rub, tag, lang, st);

-- ===== clients: no access to questions; read only their own progress/stats/activity/reports
select pg_temp.as_user(:A);
select pg_temp.expect_denied($$select * from public.questions$$);
select pg_temp.expect_denied($$select stem from public.questions$$);
select pg_temp.expect_denied($$select correct_option_ids from public.questions$$);
select pg_temp.expect_denied($$insert into public.question_progress (user_id, question_id, due_at) values (auth.uid(), '00000000-0000-4000-8000-0000000000a1', now())$$);
select pg_temp.expect_denied($$insert into public.skill_stats (user_id, skill_tag) values (auth.uid(), 'airway')$$);
select pg_temp.expect_denied($$insert into public.activity_days (user_id, day, sessions_completed) values (auth.uid(), current_date, 99)$$);
select pg_temp.expect_denied($$insert into public.question_reports (user_id, question_id) values (auth.uid(), '00000000-0000-4000-8000-0000000000a1')$$);
select pg_temp.expect_denied($$update public.skill_stats set misses = 0$$);
select pg_temp.expect_denied($$delete from public.question_progress$$);
-- every service function is closed to clients
select pg_temp.expect_denied($$select * from public.question_candidates(auth.uid(), 'en')$$);
select pg_temp.expect_denied($$select * from public.question_for_answer(auth.uid(), '00000000-0000-4000-8000-0000000000a1')$$);
select pg_temp.expect_denied($$select public.record_answer(auth.uid(), '00000000-0000-4000-8000-0000000000a1', 'circulation', true, 2.6, 1, 1, 0, 'debrief')$$);
select pg_temp.expect_denied($$select public.enroll_questions(auth.uid(), array['00000000-0000-4000-8000-0000000000a1']::uuid[], now())$$);
select pg_temp.expect_denied($$select * from public.review_due(auth.uid())$$);
select pg_temp.expect_denied($$select * from public.streak(auth.uid())$$);
select pg_temp.expect_denied($$select public.report_question(auth.uid(), '00000000-0000-4000-8000-0000000000a1', 'x')$$);
select pg_temp.expect_denied($$select * from public.claim_chat_turn(auth.uid(), gen_random_uuid())$$);
select pg_temp.expect_denied($$select public.finish_session(auth.uid(), gen_random_uuid())$$);
select pg_temp.expect_denied($$select public.record_grade(auth.uid(), gen_random_uuid(), 100, '[]')$$);
select pg_temp.expect_denied($$select public.create_session(auth.uid(), gen_random_uuid(), '{}', 'en', 60)$$);
select pg_temp.expect_denied($$select public.check_rate_limit(auth.uid(), 1000, 'questions')$$);
-- set_timezone: own row only, validated
select public.set_timezone('Asia/Seoul');
select pg_temp.expect_error($$select public.set_timezone('Mars/Olympus_Mons')$$, '22023');
select pg_temp.expect_error($$select public.set_timezone('')$$, '22023');
reset role;
select pg_temp.as_user(:B);
select public.set_timezone('America/Los_Angeles');
reset role;
select pg_temp.assert_eq('A timezone', (select timezone from public.profiles where id = :A), 'Asia/Seoul');
select pg_temp.assert_eq('B timezone (A could not change it)', (select timezone from public.profiles where id = :B), 'America/Los_Angeles');
set local role anon;
select pg_temp.expect_denied($$select public.set_timezone('UTC')$$);
reset role;

-- ===== serving: approved only, and in the requested language
set local role service_role;
select pg_temp.assert_eq('candidates: approved en only',
  (select array_agg(id::text order by id) from public.question_candidates(:A, 'en')),
  array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2']);
select pg_temp.assert_eq('candidates: ko', (select count(*) from public.question_candidates(:A, 'ko')), 1::bigint);
select pg_temp.assert_eq('key lookup: draft is invisible', (select count(*) from public.question_for_answer(:A, '00000000-0000-4000-8000-0000000000a3')), 0::bigint);
select pg_temp.assert_eq('key lookup: retired is invisible', (select count(*) from public.question_for_answer(:A, '00000000-0000-4000-8000-0000000000a4')), 0::bigint);
select pg_temp.assert_eq('key lookup: approved', (select correct_option_ids from public.question_for_answer(:A, '00000000-0000-4000-8000-0000000000a1')), '["b"]'::jsonb);
select pg_temp.assert_eq('enroll ignores drafts', (select count(*) from (select public.enroll_questions(:A, array['00000000-0000-4000-8000-0000000000a3']::uuid[], now())) x), 1::bigint);
select pg_temp.assert_eq('draft not enrolled', (select count(*) from public.question_progress where question_id = '00000000-0000-4000-8000-0000000000a3'), 0::bigint);
select pg_temp.assert_eq('report on a draft is refused', public.report_question(:A, '00000000-0000-4000-8000-0000000000a3', 'x'), false);
select pg_temp.assert_eq('report on an approved question', public.report_question(:A, '00000000-0000-4000-8000-0000000000a1', '   key looks wrong   '), true);
select pg_temp.assert_eq('report reason trimmed', (select reason from public.question_reports where user_id = :A), 'key looks wrong');
reset role;

-- ===== turn cap and inactivity (pinned clock)
\set T0 '''2026-10-05 03:00:00+00'''
set local role service_role;
insert into ids select 'cap', public.create_session(:A, (select id from ids where name = 'scenario'), '{}', 'en', 3, :T0::timestamptz);
select pg_temp.assert_eq('turn 1', (select o_ok::text || o_turn_count || o_status from public.claim_chat_turn(:A, (select id from ids where name = 'cap'), :T0::timestamptz + interval '1 minute')), 'true1active');
select pg_temp.assert_eq('B cannot claim A''s turn', (select o_reason from public.claim_chat_turn(:B, (select id from ids where name = 'cap'), :T0::timestamptz)), 'not_found');
select pg_temp.assert_eq('turn 2', (select o_ok::text || o_turn_count || o_status from public.claim_chat_turn(:A, (select id from ids where name = 'cap'), :T0::timestamptz + interval '2 minutes')), 'true2active');
select pg_temp.assert_eq('turn 3 reaches the cap and completes', (select o_ok::text || o_turn_count || o_status from public.claim_chat_turn(:A, (select id from ids where name = 'cap'), :T0::timestamptz + interval '3 minutes')), 'true3completed');
select pg_temp.assert_eq('turn 4 refused: ended', (select o_ok::text || o_reason from public.claim_chat_turn(:A, (select id from ids where name = 'cap'), :T0::timestamptz + interval '4 minutes')), 'falseended');
select pg_temp.assert_eq('end reason turn_cap', (select end_reason from public.sessions where id = (select id from ids where name = 'cap')), 'turn_cap');
-- a failed last turn is given back and re-opens the session (compare-and-swap on the claimed count)
select pg_temp.assert_eq('unclaim with a stale count does nothing', public.unclaim_chat_turn(:A, (select id from ids where name = 'cap'), 2), false);
select pg_temp.assert_eq('B cannot unclaim A''s turn', public.unclaim_chat_turn(:B, (select id from ids where name = 'cap'), 3), false);
select pg_temp.assert_eq('unclaim the capped turn', public.unclaim_chat_turn(:A, (select id from ids where name = 'cap'), 3), true);
select pg_temp.assert_eq('re-opened', (select status || turn_count || coalesce(end_reason, '-') from public.sessions where id = (select id from ids where name = 'cap')), 'active2-');
select pg_temp.expect_error($$update public.sessions set turn_count = 99 where id = (select id from ids where name = 'cap')$$, '23514');

insert into ids select 'idle', public.create_session(:A, (select id from ids where name = 'scenario'), '{}', 'en', 15, :T0::timestamptz);
select pg_temp.assert_eq('29 minutes later: still alive', (select o_ok from public.claim_chat_turn(:A, (select id from ids where name = 'idle'), :T0::timestamptz + interval '29 minutes')), true);
select pg_temp.assert_eq('59 minutes (30 after the last turn) + 1s: ended', (select o_reason || o_status from public.claim_chat_turn(:A, (select id from ids where name = 'idle'), :T0::timestamptz + interval '59 minutes 1 second')), 'endedabandoned');
select pg_temp.assert_eq('abandoned for inactivity, ended at last activity + 30 min',
  (select status || ' ' || end_reason || ' ' || to_char(ended_at at time zone 'UTC', 'HH24:MI') from public.sessions where id = (select id from ids where name = 'idle')),
  'abandoned inactive 03:59');
select pg_temp.assert_eq('get_session also applies the rule', (select status from public.get_session(:A, (select id from ids where name = 'cap'), :T0::timestamptz + interval '2 hours')), 'abandoned');
select pg_temp.assert_eq('finish on an abandoned session stays abandoned', public.finish_session(:A, (select id from ids where name = 'idle'), :T0::timestamptz + interval '3 hours'), 'abandoned');
reset role;

-- ===== record_grade: once per session, ids and score only, feeds skill_stats; abandoned sessions do not count toward streaks
set local role service_role;
insert into ids select 'g', public.create_session(:A, (select id from ids where name = 'scenario'), '{}', 'en', 15, :T0::timestamptz);
select pg_temp.assert_eq('grade refused while active', public.record_grade(:A, (select id from ids where name = 'g'), 50, '[]', :T0::timestamptz), false);
select o_ok from public.claim_chat_turn(:A, (select id from ids where name = 'g'), :T0::timestamptz + interval '1 minute');
select pg_temp.assert_eq('finish', public.finish_session(:A, (select id from ids where name = 'g'), :T0::timestamptz + interval '2 minutes'), 'completed');
select pg_temp.assert_eq('B cannot grade A''s session', public.record_grade(:B, (select id from ids where name = 'g'), 100, '[]', :T0::timestamptz), false);
select pg_temp.assert_eq('grade once', public.record_grade(:A, (select id from ids where name = 'g'), 75,
  '[{"id":"CA-CPR","passed":true,"tags":["circulation"]},{"id":"CA-HELP","passed":false,"tags":["escalation","communication","not-a-tag"]}]', :T0::timestamptz + interval '3 minutes'), true);
select pg_temp.assert_eq('second grade is a no-op', public.record_grade(:A, (select id from ids where name = 'g'), 0, '[{"id":"CA-CPR","passed":false,"tags":["circulation"]}]', :T0::timestamptz), false);
select pg_temp.assert_eq('stored summary', (select score::text || ' ' || missed_rubric_ids::text from public.sessions where id = (select id from ids where name = 'g')), '75 ["CA-HELP"]');
select pg_temp.assert_eq('skill stats from rubric tags (unknown tags dropped)',
  (select string_agg(skill_tag || ':' || attempts || '/' || misses, ',' order by skill_tag) from public.skill_stats where user_id = :A),
  'circulation:1/0,communication:1/1,escalation:1/1');
reset role;
select pg_temp.assert_eq('only the completed session counted (cap/idle sessions were abandoned)',
  (select sum(sessions_completed) from public.activity_days where user_id = :A), 1::bigint);

-- ===== streaks across timezones and day boundaries (A: Asia/Seoul, UTC+9; B: America/Los_Angeles, UTC-7 in October)
delete from public.activity_days;
set local role service_role;
-- A finishes a session at 23:30 Seoul on Oct 5 (14:30Z) and another at 00:30 Seoul on Oct 6 (15:30Z)
insert into ids select 'a1', public.create_session(:A, (select id from ids where name = 'scenario'), '{}', 'en', 15, '2026-10-05 14:20:00+00');
select o_ok from public.claim_chat_turn(:A, (select id from ids where name = 'a1'), '2026-10-05 14:25:00+00');
select public.finish_session(:A, (select id from ids where name = 'a1'), '2026-10-05 14:30:00+00');
insert into ids select 'a2', public.create_session(:A, (select id from ids where name = 'scenario'), '{}', 'en', 15, '2026-10-05 15:20:00+00');
select o_ok from public.claim_chat_turn(:A, (select id from ids where name = 'a2'), '2026-10-05 15:25:00+00');
select public.finish_session(:A, (select id from ids where name = 'a2'), '2026-10-05 15:30:00+00');
-- B finishes a session at the same instant, 15:30Z = 08:30 on Oct 5 in Los Angeles
insert into ids select 'b1', public.create_session(:B, (select id from ids where name = 'scenario'), '{}', 'en', 15, '2026-10-05 15:20:00+00');
select o_ok from public.claim_chat_turn(:B, (select id from ids where name = 'b1'), '2026-10-05 15:25:00+00');
select public.finish_session(:B, (select id from ids where name = 'b1'), '2026-10-05 15:30:00+00');
reset role;
select pg_temp.assert_eq('A: 23:30 and 00:30 Seoul land on two local days',
  (select string_agg(day::text, ',' order by day) from public.activity_days where user_id = :A), '2026-10-05,2026-10-06');
select pg_temp.assert_eq('B: the same UTC instant is Oct 5 in Los Angeles',
  (select string_agg(day::text, ',' order by day) from public.activity_days where user_id = :B), '2026-10-05');
set local role service_role;
select pg_temp.assert_eq('A at noon Oct 6 Seoul: 2 days, today counts', (select o_current || ' ' || o_today_counts from public.streak(:A, '2026-10-06 03:00:00+00')), '2 true');
select pg_temp.assert_eq('A on Oct 7 Seoul, nothing yet today: streak still alive', (select o_current || ' ' || o_today_counts from public.streak(:A, '2026-10-07 03:00:00+00')), '2 false');
select pg_temp.assert_eq('A on Oct 7 at 23:59 Seoul: still alive', (select o_current from public.streak(:A, '2026-10-07 14:59:00+00')), 2);
select pg_temp.assert_eq('A on Oct 8 00:00 Seoul: Oct 7 was missed, streak broken', (select o_current from public.streak(:A, '2026-10-07 15:00:00+00')), 0);
select pg_temp.assert_eq('B at 23:00 Oct 5 LA (06:00Z Oct 6): today counts', (select o_current || ' ' || o_today_counts from public.streak(:B, '2026-10-06 06:00:00+00')), '1 true');
select pg_temp.assert_eq('B at 00:30 Oct 6 LA: yesterday still carries it', (select o_current || ' ' || o_today_counts from public.streak(:B, '2026-10-06 07:30:00+00')), '1 false');
select pg_temp.assert_eq('B on Oct 7 LA: broken', (select o_current from public.streak(:B, '2026-10-07 08:00:00+00')), 0);
-- completing that day's review also counts the day (B, Oct 6 LA)
select public.enroll_questions(:B, array['00000000-0000-4000-8000-0000000000a1']::uuid[], '2026-10-06 08:00:00+00');
select pg_temp.assert_eq('B has 1 due on Oct 6 LA', public.review_due_count(:B, '2026-10-06 20:00:00+00'), 1);
select pg_temp.assert_eq('debrief answer: recorded', public.record_answer(:B, '00000000-0000-4000-8000-0000000000a2', 'escalation', false, 2.3, 1, 0, 0, 'debrief', '2026-10-06 20:00:00+00'), true);
select pg_temp.assert_eq('debrief answers alone do not count the day', (select o_today_counts from public.streak(:B, '2026-10-06 20:00:00+00')), false);
select pg_temp.assert_eq('review answer: recorded', public.record_answer(:B, '00000000-0000-4000-8000-0000000000a1', 'circulation', true, 2.6, 1, 1, 0, 'review', '2026-10-06 20:01:00+00'), true);
select pg_temp.assert_eq('the review is done -> the day counts: 2-day streak', (select o_current || ' ' || o_today_counts from public.streak(:B, '2026-10-06 20:02:00+00')), '2 true');
select pg_temp.assert_eq('stale answer (expected attempts mismatch) writes nothing', public.record_answer(:B, '00000000-0000-4000-8000-0000000000a1', 'circulation', true, 2.7, 3, 2, 0, 'review', '2026-10-06 20:03:00+00'), false);
select pg_temp.assert_eq('progress after one review answer', (select attempts || ' ' || interval_days || ' ' || correct_streak from public.question_progress where user_id = :B and question_id = '00000000-0000-4000-8000-0000000000a1'), '1 1 1');
reset role;

-- ===== the daily review cap: at most 10 review answers a day
set local role service_role;
insert into public.questions (scenario_id, rubric_item_id, skill_tag, language, stem, options, correct_option_ids, explanation, status, reviewed_at)
select (select id from ids where name = 'scenario'), 'CA-CPR', 'circulation', 'en', 'Cap question number ' || g || ' stem?', :OPTS::jsonb, '["a"]', 'CA-CPR: explanation.', 'approved', now()
  from generate_series(1, 12) g;
select public.enroll_questions(:A, (select array_agg(id) from public.questions where stem like 'Cap question%'), '2026-10-10 00:00:00+00');
select pg_temp.assert_eq('12 due, 10 served', (select count(*) from public.review_due(:A, '2026-10-10 03:00:00+00')), 10::bigint);
select pg_temp.assert_eq('due count is uncapped', public.review_due_count(:A, '2026-10-10 03:00:00+00'), 12);
select pg_temp.assert_eq('nothing due before its day', (select count(*) from public.review_due(:A, '2026-10-09 03:00:00+00')), 0::bigint);
do $$ declare q uuid; begin
  for q in select id from public.questions where stem like 'Cap question%' order by id limit 4 loop
    perform public.record_answer('aaaaaaaa-1111-4000-8000-00000000000a', q, 'circulation', true, 2.6, 1, 1, 0, 'review', '2026-10-10 03:05:00+00');
  end loop;
end $$;
select pg_temp.assert_eq('cap shrinks as reviews are answered', (select count(*) from public.review_due(:A, '2026-10-10 03:10:00+00')), 6::bigint);
select pg_temp.assert_eq('review not yet completed (8 still due)', (select review_completed from public.activity_days where user_id = :A and day = '2026-10-10'), false);
do $$ declare q uuid; begin
  for q in select p.question_id from public.question_progress p join public.questions x on x.id = p.question_id
            where p.user_id = 'aaaaaaaa-1111-4000-8000-00000000000a' and x.stem like 'Cap question%' and p.attempts = 0 order by p.question_id limit 6 loop
    perform public.record_answer('aaaaaaaa-1111-4000-8000-00000000000a', q, 'circulation', true, 2.6, 1, 1, 0, 'review', '2026-10-10 03:15:00+00');
  end loop;
end $$;
select pg_temp.assert_eq('cap reached: nothing more served today', (select count(*) from public.review_due(:A, '2026-10-10 03:20:00+00')), 0::bigint);
select pg_temp.assert_eq('reaching the cap completes the day''s review', (select review_completed from public.activity_days where user_id = :A and day = '2026-10-10'), true);
select pg_temp.assert_eq('the next local day serves again', (select count(*) from public.review_due(:A, '2026-10-11 03:00:00+00')) > 0, true);
-- answering questions never touches the message quota or cost
select pg_temp.assert_eq('no usage rows from answering', (select count(*) from public.usage_daily where user_id in (:A, :B)), 0::bigint);
select pg_temp.assert_eq('no global cost from answering', (select count(*) from public.global_usage_daily), 0::bigint);
reset role;

-- ===== two users: each reads only their own rows
select pg_temp.as_user(:A);
select pg_temp.assert_eq('A progress rows are all A''s', (select count(*) from public.question_progress where user_id <> auth.uid()), 0::bigint);
select pg_temp.assert_eq('A sees own progress', (select count(*) > 0 from public.question_progress), true);
select pg_temp.assert_eq('A cannot see B progress', (select count(*) from public.question_progress where user_id = 'bbbbbbbb-2222-4000-8000-00000000000b'), 0::bigint);
select pg_temp.assert_eq('A cannot see B skill stats', (select count(*) from public.skill_stats where user_id = 'bbbbbbbb-2222-4000-8000-00000000000b'), 0::bigint);
select pg_temp.assert_eq('A cannot see B activity', (select count(*) from public.activity_days where user_id = 'bbbbbbbb-2222-4000-8000-00000000000b'), 0::bigint);
select pg_temp.assert_eq('A sees own report', (select count(*) from public.question_reports), 1::bigint);
select pg_temp.assert_eq('A sees own sessions only', (select count(*) from public.sessions where user_id <> auth.uid()), 0::bigint);
reset role;
select pg_temp.as_user(:B);
select pg_temp.assert_eq('B sees own progress only', (select count(*) from public.question_progress where user_id <> auth.uid()), 0::bigint);
select pg_temp.assert_eq('B sees none of A''s reports', (select count(*) from public.question_reports), 0::bigint);
select pg_temp.assert_eq('B sees own activity', (select count(*) > 0 from public.activity_days), true);
select pg_temp.assert_eq('B cannot read A''s stats', (select count(*) from public.skill_stats where user_id = 'aaaaaaaa-1111-4000-8000-00000000000a'), 0::bigint);
reset role;
set local role anon;
select pg_temp.expect_denied($$select * from public.question_progress$$);
select pg_temp.expect_denied($$select * from public.skill_stats$$);
select pg_temp.expect_denied($$select * from public.activity_days$$);
select pg_temp.expect_denied($$select * from public.question_reports$$);
select pg_temp.expect_denied($$select * from public.questions$$);
reset role;

-- ===== rate-limit scopes are separate buckets
set local role service_role;
select pg_temp.assert_eq('llm bucket 1/1', public.check_rate_limit(:A, 1, 'llm'), true);
select pg_temp.assert_eq('llm bucket 2/1 refused', public.check_rate_limit(:A, 1, 'llm'), false);
select pg_temp.assert_eq('questions bucket unaffected', public.check_rate_limit(:A, 1, 'questions'), true);
select pg_temp.assert_eq('legacy 2-arg form uses the llm bucket', public.check_rate_limit(:A, 5), true);
reset role;

-- ===== deleting a user removes all their question data
delete from auth.users where id = :B;
select pg_temp.assert_eq('cascade', (select count(*) from public.question_progress where user_id = :B)
  + (select count(*) from public.skill_stats where user_id = :B) + (select count(*) from public.activity_days where user_id = :B), 0::bigint);

rollback;
\echo 'ALL QUESTION BANK / BOUNDED SESSION TESTS PASSED'
