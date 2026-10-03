#!/usr/bin/env bash
# Atomicity check on a real database: 30 concurrent connections race for 5 quota slots.
# Usage: DB_URL=postgres://... tests/parallel_quota.sh   (migrations applied, tier limit forced to 5)
set -euo pipefail
: "${DB_URL:?set DB_URL}"
U=33333333-3333-4333-8333-333333333333
psql "$DB_URL" -qAt -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id) values ('$U') on conflict do nothing;
insert into public.tiers (name, daily_message_limit, chat_model, grade_model, max_output_tokens)
  values ('race', 5, 'm', 'm', 100) on conflict (name) do update set daily_message_limit = 5;
update public.profiles set tier = 'race' where id = '$U';
delete from public.usage_daily where user_id = '$U';
SQL
for i in $(seq 1 30); do
  psql "$DB_URL" -qAt -c "select o_allowed from public.consume_quota('$U', 1)" &
done > /tmp/bright_parallel.$$ 2>&1
wait
allowed=$(grep -c '^t$' /tmp/bright_parallel.$$ || true)
rm -f /tmp/bright_parallel.$$
used=$(psql "$DB_URL" -qAt -c "select messages from public.usage_daily where user_id = '$U'")
echo "allowed=$allowed messages_recorded=$used (want 5/5)"
[ "$allowed" = 5 ] && [ "$used" = 5 ]
