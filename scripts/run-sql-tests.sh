#!/usr/bin/env bash
# Runs the SQL tests (RLS, quota, sessions) on a throwaway local Postgres. No Docker, no network, no secrets.
#   scripts/run-sql-tests.sh
# Needs the Postgres binaries on PATH (brew install postgresql@17). The scratch cluster lives in a temp
# dir that is deleted on exit. tests/stub_supabase.sql only fakes the Supabase roles/schemas; it is never
# applied to a real project.
set -euo pipefail
cd "$(dirname "$0")/../supabase"

for t in initdb pg_ctl psql; do
  command -v "$t" >/dev/null || { echo "Missing $t (brew install postgresql@17 and add it to PATH)" >&2; exit 2; }
done

DIR="$(mktemp -d)"
SOCK="$DIR/sock"; mkdir -p "$SOCK"
PORT=$((55000 + RANDOM % 5000))
cleanup() { pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

initdb -D "$DIR/data" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR/data" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$DIR/pg.log" -w start >/dev/null
export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
psql -qAt -v ON_ERROR_STOP=1 -c "create database bright_test" >/dev/null
export PGDATABASE=bright_test

psql -q -v ON_ERROR_STOP=1 -f tests/stub_supabase.sql >/dev/null
for f in migrations/*.sql; do
  echo "migration: $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
# Same seed files `supabase start` loads (config.toml [db.seed]).
for f in seed.sql seed_sim.sql; do
  [ -f "$f" ] && psql -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

fail=0
for t in tests/rls_and_quota.sql tests/sessions_rls.sql tests/questions_rls.sql; do
  [ -f "$t" ] || continue
  echo "== $t"
  psql -q -o /dev/null -v ON_ERROR_STOP=1 -f "$t" && echo "PASS: $t" || fail=1
done

echo "== tests/parallel_claim.sh"
bash tests/parallel_claim.sh && echo "PASS: tests/parallel_claim.sh" || fail=1
exit $fail
