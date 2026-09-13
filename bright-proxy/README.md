# bright-proxy

Bright's Groq proxy on Cloudflare Workers — free plan, no payment method. It replaces the
Firebase Cloud Function sketched in `bright-site/functions/` (that one needs Blaze).

```
POST /v1/turn   { "messages": [{ "role": "system" | "user" | "assistant", "content": "…" }] }
```

| Caller sends | What happens |
|---|---|
| `Authorization: Bearer <Firebase ID token>` | Token verified against Google's keys for project `bright-34c23`. Today's turn count for that uid is checked and incremented (limit `DAILY_TURN_LIMIT`, 40, resets at UTC midnight). The request goes to Groq with the `GROQ_API_KEY` secret, model fixed to `openai/gpt-oss-120b`. |
| `X-Groq-Key: <own key>` (BYOK) | Forwarded with that key for this request only. Not stored, not logged, not metered. Wins if both headers are sent. |
| Neither | `401 { code: "unauthenticated" }` |

Responses: `200 { turn, quota? }`, `429 { code: "quota_exceeded", resetAt }`, `401`, `400`,
`403` (browser origin not in `ALLOWED_ORIGINS`), `502/503` (Groq trouble — on the hosted
path the message is generic, so nothing about the account behind the key leaks).

A failed upstream call refunds the turn. Messages are rebuilt from an allowlist, bodies are
capped at 200 KB / 80 messages, and completions at 1500 tokens.

## Run and deploy

```bash
npm install
echo 'GROQ_API_KEY=gsk_…' > .dev.vars   # local only, gitignored
npm run dev                               # http://localhost:8787

npx wrangler login
npx wrangler deploy
npx wrangler secret put GROQ_API_KEY      # paste the key at the prompt — never on the command line
```

After the demo is deployed, add its origin to `ALLOWED_ORIGINS` in `wrangler.jsonc` and deploy
again. The daily counter is a SQLite-backed Durable Object (`QuotaCounter`), which the free plan
includes.

**Not done here:** token revocation isn't checked (that needs the Admin SDK), so a signed-out
token stays usable until it expires, at most an hour.
