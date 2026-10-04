#!/usr/bin/env bash
# Smoke test for the deployed `chat` Edge Function.
#
#   export SUPABASE_URL="https://<project-ref>.supabase.co"
#   export SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."     # public key; never a secret key
#   export SMOKE_EMAIL="smoke-test@example.com"
#   export SMOKE_PASSWORD="..."                              # type it in your own terminal
#   scripts/smoke-test.sh
#
# Optional: SMOKE_LANGUAGE (en|ko, default en), SMOKE_SCENARIO_ID (default: first active scenario
# in that language). Spends 1 daily message of the test user on the happy-path call.
# Needs: bash, curl, jq. No credential is ever printed, written to the repo, or put on a command line.
set -u
set -o pipefail

need() { [ -n "${!1:-}" ] || { echo "Missing environment variable: $1" >&2; missing=1; }; }
missing=0
for v in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SMOKE_EMAIL SMOKE_PASSWORD; do need "$v"; done
[ "$missing" = 0 ] || { echo "Set the variables above in your terminal (see the header of this script)." >&2; exit 2; }
for t in curl jq; do command -v "$t" >/dev/null || { echo "Missing tool: $t" >&2; exit 2; }; done

case "$SUPABASE_PUBLISHABLE_KEY" in
  sb_secret_*) echo "Refusing to run: that is a SECRET key. Use the publishable key (sb_publishable_...)." >&2; exit 2 ;;
esac

BASE="${SUPABASE_URL%/}"
LANGUAGE="${SMOKE_LANGUAGE:-en}"
TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }

# curl reads secrets from files/stdin so they never appear in `ps` output.
hdr() { printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SUPABASE_PUBLISHABLE_KEY" "$1" > "$TMP/h"; }

echo "== 1. Sign in as the test user"
jq -n --arg e "$SMOKE_EMAIL" --arg p "$SMOKE_PASSWORD" '{email:$e,password:$p}' |
  curl -sS -o "$TMP/login.json" -w '%{http_code}' -X POST "$BASE/auth/v1/token?grant_type=password" \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'content-type: application/json' --data @- > "$TMP/login.status" 2>"$TMP/login.err"
LOGIN_STATUS="$(cat "$TMP/login.status" 2>/dev/null)"
TOKEN="$(jq -r '.access_token // empty' "$TMP/login.json" 2>/dev/null)"
if [ "$LOGIN_STATUS" = 200 ] && [ -n "$TOKEN" ]; then
  ok "signed in (HTTP 200); token received (not printed)"
else
  if [ "${LOGIN_STATUS:-000}" = 000 ]; then
    bad "could not reach $BASE ($(head -c 200 "$TMP/login.err" | tr '\n' ' '))"
    echo "   Check SUPABASE_URL (https://<project-ref>.supabase.co) and your network." >&2
  else
    bad "sign-in failed (HTTP $LOGIN_STATUS): $(jq -r '.error_code // .msg // .error // "no detail"' "$TMP/login.json" 2>/dev/null)"
    echo "   Check the email/password, that the user is confirmed, and that email sign-in is enabled." >&2
  fi
  echo; echo "Result: $pass passed, $fail failed"; exit 1
fi

echo "== 2. Pick a scenario ($LANGUAGE)"
SCENARIO_ID="${SMOKE_SCENARIO_ID:-}"
if [ -z "$SCENARIO_ID" ]; then
  hdr "$TOKEN"
  SCENARIO_ID="$(curl -sS -H @"$TMP/h" "$BASE/rest/v1/scenario_list?language=eq.$LANGUAGE&select=id,title&limit=1" | jq -r '.[0].id // empty')"
fi
if [ -n "$SCENARIO_ID" ]; then ok "scenario $SCENARIO_ID"; else bad "no scenario found (did you run supabase/seed.sql?)"; echo "Result: $pass passed, $fail failed"; exit 1; fi

BODY="$(jq -n --arg s "$SCENARIO_ID" --arg l "$LANGUAGE" \
  '{scenario_id:$s, language:$l, messages:[{role:"user", content:"Begin the session. Ask the first question."}]}')"

call_chat() { # $1 = label, $2 = bearer token or "-" for none; writes $TMP/$1.body / .headers / .meta
  local label="$1" tok="$2"
  if [ "$tok" = "-" ]; then printf 'apikey: %s\n' "$SUPABASE_PUBLISHABLE_KEY" > "$TMP/h"; else hdr "$tok"; fi
  printf '%s' "$BODY" | curl -sS -N -o "$TMP/$label.body" -D "$TMP/$label.headers" \
    -w '%{http_code} %{time_starttransfer} %{time_total}' -X POST "$BASE/functions/v1/chat" \
    -H @"$TMP/h" -H 'content-type: application/json' --data @- > "$TMP/$label.meta" 2>"$TMP/$label.err" || true
}

echo "== 3. Chat with a valid token"
call_chat valid "$TOKEN"
read -r STATUS TTFB TOTAL < "$TMP/valid.meta" || true
CTYPE="$(grep -i '^content-type:' "$TMP/valid.headers" 2>/dev/null | tr -d '\r' | head -1 | cut -d' ' -f2-)"
echo "  HTTP status:        ${STATUS:-none}"
if [ "${STATUS:-}" = 200 ]; then
  # Our SSE envelope: data: {"delta":"..."} ... data: {"done":true,"remaining":N,"limit":N}
  DELTAS="$(grep -c '^data: {"delta"' "$TMP/valid.body" || true)"
  REPLY="$(grep '^data: ' "$TMP/valid.body" | sed 's/^data: //' | jq -rj 'select(.delta) | .delta' 2>/dev/null)"
  DONE="$(grep '^data: ' "$TMP/valid.body" | sed 's/^data: //' | jq -c 'select(.done == true)' 2>/dev/null | tail -1)"
  REMAINING="$(printf '%s' "$DONE" | jq -r '.remaining // empty' 2>/dev/null)"
  LIMIT="$(printf '%s' "$DONE" | jq -r '.limit // empty' 2>/dev/null)"
  [ -n "$REMAINING" ] || REMAINING="$(grep -i '^x-quota-remaining:' "$TMP/valid.headers" | tr -d '\r' | awk '{print $2}')"
  echo "  Content-Type:       ${CTYPE:-?}"
  echo "  Streamed reply:     $([ "$DELTAS" -gt 0 ] && echo "YES ($DELTAS chunks; first byte ${TTFB}s, complete ${TOTAL}s)" || echo NO)"
  echo "  Reply (first 100):  $(printf '%s' "$REPLY" | tr '\n' ' ' | cut -c1-100)"
  echo "  Remaining today:    ${REMAINING:-unknown}${LIMIT:+ of $LIMIT}"
  case "$CTYPE" in text/event-stream*) ok "response is an SSE stream" ;; *) bad "expected text/event-stream, got '${CTYPE:-none}'" ;; esac
  [ "$DELTAS" -gt 0 ] && ok "received $DELTAS streamed reply chunk(s)" || bad "no reply chunks in the stream"
  [ -n "$DONE" ] && ok "stream ended with a done event" || bad "no done event (stream cut short?)"
  [ -n "$REMAINING" ] && ok "remaining daily messages reported: $REMAINING" || bad "remaining count missing"
  grep -q 'event: error' "$TMP/valid.body" && bad "stream contained an error event" || true
else
  CODE="$(jq -r '.error // empty' "$TMP/valid.body" 2>/dev/null)"
  RESETS="$(jq -r '.resets_at // empty' "$TMP/valid.body" 2>/dev/null)"
  echo "  Streamed reply:     NO"
  echo "  Error code:         ${CODE:-none}${RESETS:+ (resets at $RESETS)}"
  case "$CODE" in
    age_required)   echo "  Hint: run the age_confirmed SQL for this user (docs/MANUAL_STEPS.md, 'Create the smoke-test user')." ;;
    daily_limit)    echo "  Hint: the test user is out of messages for today (resets at midnight KST)." ;;
    budget_reached) echo "  Hint: the global daily budget was reached." ;;
    rate_limited)   echo "  Hint: too many requests this minute; wait a minute and retry." ;;
    upstream_error) echo "  Hint: the LLM call failed. Check LLM_API_KEY / LLM_BASE_URL / model secrets and the function logs." ;;
    unauthenticated) echo "  Hint: token rejected. Check SUPABASE_JWKS/URL, asymmetric JWT signing keys enabled, project URL matches." ;;
  esac
  bad "chat with a valid token returned HTTP ${STATUS:-none}${CODE:+ ($CODE)}"
fi

echo "== 4. Chat with NO token (expect 401)"
call_chat none -
read -r S _ < "$TMP/none.meta" || true
[ "${S:-}" = 401 ] && ok "no token -> 401 ($(jq -r '.error // "?"' "$TMP/none.body" 2>/dev/null))" || bad "no token -> HTTP ${S:-none} (expected 401)"

echo "== 5. Chat with a JUNK token (expect 401)"
call_chat junk "junk.not-a.real-token"
read -r S _ < "$TMP/junk.meta" || true
[ "${S:-}" = 401 ] && ok "junk token -> 401 ($(jq -r '.error // "?"' "$TMP/junk.body" 2>/dev/null))" || bad "junk token -> HTTP ${S:-none} (expected 401)"

echo "== 6. Chat with the publishable key used as a token (expect 401)"
call_chat apikey "$SUPABASE_PUBLISHABLE_KEY"
read -r S _ < "$TMP/apikey.meta" || true
[ "${S:-}" = 401 ] && ok "API key as bearer -> 401" || bad "API key as bearer -> HTTP ${S:-none} (expected 401)"

echo
echo "Result: $pass passed, $fail failed"
[ "$fail" = 0 ]
