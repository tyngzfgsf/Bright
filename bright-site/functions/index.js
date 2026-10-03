/**
 * Bright backend — authenticated Groq proxy. See BACKEND_PLAN.md Phase 2.
 *
 * The one invariant every later phase depends on: the Groq key lives here, server-side, and is
 * never returned to the client in any response or error path. Nothing in this file writes it
 * into a response body, a header, or a log line.
 *
 * Metering (Phase 3): every request must carry a `drill_id` issued by `startHostedDrill`, which
 * is where the free-tier cap is enforced. The proxy itself only checks that the drill is the
 * caller's, still fresh, and under its turn ceiling — see billing/entitlements.js.
 * Billing (Phase 5) lives in billing/stripe.js.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { consumeDrillTurn } from "./billing/entitlements.js";

export {
  getBillingStatus,
  startHostedDrill,
  createSubscriptionCheckout,
  createAddOnPayment,
  cancelSubscription,
  resumeSubscription,
  retryFailedPayment,
  stripeWebhook,
} from "./billing/stripe.js";

initializeApp();

/**
 * Set once, out of band, with:  firebase functions:secrets:set GROQ_API_KEY
 * It is never committed, never printed, and never leaves this process.
 */
const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Hard ceiling on completion length, independent of what the client asks for.
 *
 * The Android client currently sends 700 (see GroqChatRequest), so this is not a functional
 * limit today — it's a cost floor-plan. A client is not a trusted source of "how many tokens
 * should I pay for", and until Phase 3 counts sessions this is the only thing bounding the
 * per-request cost of a compromised or modified APK.
 */
const MAX_COMPLETION_TOKENS_CEILING = 2000;

/** Roughly 200KB of messages. Guards against a single request carrying a huge prompt. */
const MAX_MESSAGES_BYTES = 200_000;

const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

/**
 * Hosted drills always run on this model, whatever the client asks for. The model picker in
 * Settings is a BYOK feature (the trainee's own key, their own bill); letting it reach this
 * endpoint would let any client choose how expensive each call on Jason's key is.
 */
const HOSTED_MODEL = "openai/gpt-oss-120b";

/** Client-facing reasons a drill id was refused. The app maps these to "start a new drill". */
const DRILL_ERRORS = {
  drill_required: "Start a drill first.",
  drill_expired: "This drill has expired. Start a new one.",
  drill_turn_limit: "This drill has reached its length limit. Start a new one.",
};

export const proxyChatCompletion = onRequest(
  {
    secrets: [GROQ_API_KEY],
    region: "us-central1",
    // Cost guardrail, not a performance setting. Firebase has no hard spend cap, so bounding
    // concurrency is the closest thing to one available at the code level.
    maxInstances: 10,
    timeoutSeconds: 120,
    // The Android app is not a browser and sends no Origin, so CORS is off. It gets turned on
    // deliberately in Phase 6 when a web client exists, with an explicit origin allowlist —
    // not left open now "just in case".
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Use POST.", type: "method_not_allowed" } });
      return;
    }

    // --- 1. Authenticate ------------------------------------------------------------------
    const authHeader = req.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({
        error: { message: "Missing Authorization: Bearer <Firebase ID token>.", type: "unauthenticated" },
      });
      return;
    }

    let uid;
    try {
      // checkRevoked: true so that signing out / disabling an account takes effect immediately
      // rather than staying valid for the remainder of the token's hour-long life. Costs one
      // extra lookup per call; worth it on an endpoint that spends money.
      const decoded = await getAuth().verifyIdToken(match[1], true);
      uid = decoded.uid;
    } catch (err) {
      // Deliberately does not echo err.message — that can distinguish "expired" from "forged"
      // from "wrong project", which is free reconnaissance for anyone probing the endpoint.
      res.status(401).json({ error: { message: "Invalid or expired sign-in.", type: "unauthenticated" } });
      return;
    }

    // --- 2. Validate the request ----------------------------------------------------------
    const body = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: { message: "Expected a JSON object body.", type: "invalid_request" } });
      return;
    }

    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: { message: "`messages` must be a non-empty array.", type: "invalid_request" } });
      return;
    }
    for (const m of messages) {
      if (!m || typeof m !== "object" || !ALLOWED_ROLES.has(m.role) || typeof m.content !== "string") {
        res.status(400).json({
          error: { message: "Each message needs a valid `role` and a string `content`.", type: "invalid_request" },
        });
        return;
      }
    }
    if (Buffer.byteLength(JSON.stringify(messages), "utf8") > MAX_MESSAGES_BYTES) {
      res.status(413).json({ error: { message: "Conversation too large.", type: "invalid_request" } });
      return;
    }

    // --- 3. Meter --------------------------------------------------------------------------
    // After validation, so a malformed request doesn't use up a turn.
    const drillError = await consumeDrillTurn(uid, body.drill_id);
    if (drillError) {
      res.status(402).json({ error: { message: DRILL_ERRORS[drillError], type: drillError } });
      return;
    }

    // --- 4. Forward, with an allowlist ----------------------------------------------------
    // Rebuilt field by field rather than spreading `body`, so a client cannot smuggle through
    // parameters this proxy hasn't considered the cost or safety of.
    const upstreamRequest = {
      model: HOSTED_MODEL,
      messages,
      temperature: clampNumber(body.temperature, 0, 2, 0.85),
      max_completion_tokens: clampNumber(body.max_completion_tokens, 1, MAX_COMPLETION_TOKENS_CEILING, 700),
    };
    if (body.response_format && body.response_format.type === "json_object") {
      upstreamRequest.response_format = { type: "json_object" };
    }

    try {
      const upstream = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(upstreamRequest),
      });

      const text = await upstream.text();

      if (!upstream.ok) {
        // uid, not the token or the key — enough to correlate a complaint to a request.
        console.error(`Groq returned ${upstream.status} for uid=${uid}`);
        res.status(upstream.status === 429 ? 429 : 502).json({
          error: {
            message: upstream.status === 429 ? "The AI service is rate limited. Try again shortly." : "The AI service failed.",
            type: "upstream_error",
          },
        });
        return;
      }

      // Passed through verbatim so the client's existing GroqChatResponse parsing is unchanged.
      res.status(200).type("application/json").send(text);
    } catch (err) {
      console.error(`Proxy request failed for uid=${uid}:`, err?.message);
      res.status(502).json({ error: { message: "Could not reach the AI service.", type: "upstream_error" } });
    }
  }
);

function clampNumber(value, min, max, fallback) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(n, min), max);
}
