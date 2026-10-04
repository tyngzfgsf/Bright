#!/usr/bin/env bash
# Atomicity check on a real database: 20 concurrent connections race to claim the same turn of one session.
# Exactly one may win. Uses the standard PG* environment variables (scripts/run-sql-tests.sh sets them).
set -euo pipefail
U=44444444-4444-4444-8444-444444444444
SID=$(psql -qAt -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id) values ('$U') on conflict do nothing;
select public.create_session('$U', (select id from public.scenarios where slug = 'anaphylaxis-sim' and language = 'en'), '{"v":1}'::jsonb);
SQL
)
OUT="$(mktemp)"
for i in $(seq 1 20); do
  psql -qAt -c "select public.claim_session_turn('$U', '$SID', 0)" &
done > "$OUT" 2>&1
wait
won=$(grep -c '^t$' "$OUT" || true)
rm -f "$OUT"
echo "turn claims won=$won of 20 (want exactly 1)"
[ "$won" = 1 ]
