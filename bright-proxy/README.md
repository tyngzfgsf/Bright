# bright-proxy

Bright's backend on Cloudflare Workers — free plan, no payment method: the Groq proxy, and the
account every payment system feeds into (Google Play and the App Store via RevenueCat, the
website via Paddle). It replaces the Firebase Cloud Function sketched in `bright-site/functions/`
(that one needs Blaze). Billing setup: `../MONETIZATION.md`.

```
POST /v1/turn   { "messages": [{ "role": "system" | "user" | "assistant", "content": "…" }],
                  "drill_id": "<one id per practice case>", "format": "json" | "text" }
GET  /v1/account                      plan, usage and credits for the signed-in uid
POST /v1/web/cancel | resume | update-payment     manage a website (Paddle) subscription
POST /v1/retention-offer-used         the app took a store-side exit offer
POST /webhooks/revenuecat | /webhooks/paddle      payment systems → Account
```

| Caller sends | What happens |
|---|---|
| `Authorization: Bearer <Firebase ID token>` | Token verified against Google's keys for project `bright-34c23`. The first turn with a new `drill_id` spends one of the month's drills (10 on Free, 300 fair-use on Plus/Pro; then purchased bonus drills); a drill allows 80 turns over 12 hours. Clients that send no `drill_id` count as one drill per UTC day. The request goes to Groq with the `GROQ_API_KEY` secret, model fixed to `openai/gpt-oss-120b`. |
| `X-Groq-Key: <own key>` (BYOK) | Forwarded with that key for this request only. Not stored, not logged, not metered. Wins if both headers are sent. |
| Neither | `401 { code: "unauthenticated" }` |

Responses: `200 { turn | text, usage? }`, `429 { code: "drill_limit", reason }`, `409 { code: "drill_expired" | "drill_turn_limit" }` (start a new drill id), `401`, `400`,
`403` (browser origin not in `ALLOWED_ORIGINS`), `502/503` (Groq trouble — on the hosted
path the message is generic, so nothing about the account behind the key leaks).

A failed upstream call refunds the turn (and the drill, if it was the first turn). Messages are rebuilt from an allowlist, bodies are
capped at 200 KB / 80 messages, and completions at 1500 tokens.

## Run and deploy

```bash
npm install
echo 'GROQ_API_KEY=gsk_…' > .dev.vars   # local only, gitignored
npm run dev                               # http://localhost:8787

npx wrangler login
npx wrangler deploy
npx wrangler secret put GROQ_API_KEY      # paste the key at the prompt — never on the command line
npm test                                  # billing logic: metering, RevenueCat/Paddle mapping, signatures
```

After the demo is deployed, add its origin to `ALLOWED_ORIGINS` in `wrangler.jsonc` and deploy
again. Accounts are SQLite-backed Durable Objects (`Account`, one per uid), which the free plan
includes. `QuotaCounter` is the retired daily counter, kept only so its class stays deployed.

**Not done here:** token revocation isn't checked (that needs the Admin SDK), so a signed-out
token stays usable until it expires, at most an hour.
