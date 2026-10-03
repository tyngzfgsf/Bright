/**
 * Stripe subscriptions, add-ons, cancellation/exit offer, dunning — BACKEND_PLAN.md Phase 5.
 *
 * Payment UI is Stripe's PaymentSheet inside the app (Google Pay + cards), not a hosted web
 * page: the app calls one of these functions for a client secret and confirms it in-app. The
 * webhook is the only thing that ever changes a user's plan — a client saying "I paid" counts
 * for nothing until Stripe says so.
 *
 * Written against Stripe's 2025+ API ("basil"), where an invoice's PaymentIntent is reached via
 * `confirmation_secret`, period dates live on subscription items, and an invoice's subscription
 * is under `parent.subscription_details`. Older field locations are read as fallbacks.
 */

import Stripe from "stripe";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import {
  ADD_ONS,
  ALL_LOOKUP_KEYS,
  CURRENCIES,
  PLANS,
  PLUS_TRIAL_DAYS,
  PRO_MONTHLY_STREAK_FREEZES,
  RETENTION_COUPON_ID,
  RETENTION_MONTHS,
  RETENTION_PERCENT_OFF,
  planForLookupKey,
} from "./catalog.js";
import { db, grantCredits, startDrill, toClientEntitlement, userRef } from "./entitlements.js";
import { queueEmail } from "./emails.js";

export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const CALLABLE_OPTS = {
  region: "us-central1",
  secrets: [STRIPE_SECRET_KEY],
  maxInstances: 10,
  // App Check is worth turning on once the app integrates it; until then, auth is the gate.
  enforceAppCheck: false,
};

let stripeClient = null;
function stripe() {
  if (!stripeClient) stripeClient = new Stripe(STRIPE_SECRET_KEY.value());
  return stripeClient;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return uid;
}

/** lookup_key -> Price, cached for the life of the instance. Prices are immutable in Stripe. */
let priceCache = null;
async function prices() {
  if (priceCache) return priceCache;
  const list = await stripe().prices.list({
    lookup_keys: ALL_LOOKUP_KEYS,
    active: true,
    expand: ["data.currency_options"],
    limit: 100,
  });
  const byKey = new Map(list.data.map((p) => [p.lookup_key, p]));
  const missing = ALL_LOOKUP_KEYS.filter((k) => !byKey.has(k));
  if (missing.length) {
    // Loud, because it means the Stripe account was never set up (scripts/setup-stripe.js).
    console.error("Stripe is missing prices for lookup keys:", missing.join(", "));
    throw new HttpsError("failed-precondition", "Billing isn't configured yet.");
  }
  priceCache = byKey;
  return byKey;
}

function amountIn(price, currency) {
  if (price.currency === currency) return price.unit_amount;
  const option = price.currency_options?.[currency];
  if (!option || option.unit_amount == null) {
    throw new HttpsError("failed-precondition", `No ${currency.toUpperCase()} price for ${price.lookup_key}.`);
  }
  return option.unit_amount;
}

function validateCurrency(raw) {
  const currency = String(raw || "").toLowerCase();
  if (!CURRENCIES.has(currency)) throw new HttpsError("invalid-argument", "Unsupported currency.");
  return currency;
}

function validateAddOns(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const unique = [...new Set(list.map(String))];
  for (const key of unique) {
    if (!ADD_ONS[key]) throw new HttpsError("invalid-argument", `Unknown add-on ${key}.`);
  }
  return unique;
}

async function ensureCustomer(uid) {
  const ref = userRef(uid);
  const snap = await ref.get();
  const existing = snap.get("stripeCustomerId");
  if (existing) return existing;

  const user = await getAuth().getUser(uid);
  const customer = await stripe().customers.create(
    { email: user.email, name: user.displayName || undefined, metadata: { uid } },
    // Two quick taps must not make two customers.
    { idempotencyKey: `customer-${uid}` }
  );
  await ref.set({ stripeCustomerId: customer.id, email: user.email || null }, { merge: true });
  return customer.id;
}

/** The customer's live subscription, if any (one per user). */
async function liveSubscription(customerId) {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  return subs.data.find((s) => ["trialing", "active", "past_due", "unpaid"].includes(s.status)) || null;
}

async function ensureRetentionCoupon() {
  try {
    await stripe().coupons.retrieve(RETENTION_COUPON_ID);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    await stripe().coupons.create({
      id: RETENTION_COUPON_ID,
      percent_off: RETENTION_PERCENT_OFF,
      duration: "repeating",
      duration_in_months: RETENTION_MONTHS,
      name: `${RETENTION_PERCENT_OFF}% off for ${RETENTION_MONTHS} months`,
    });
  }
}

function invoiceSubscriptionId(invoice) {
  return invoice.parent?.subscription_details?.subscription || invoice.subscription || null;
}

function linePriceId(line) {
  return line.pricing?.price_details?.price || line.price?.id || null;
}

// ---------------------------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------------------------

/** Current plan + usage. Also records the app's UI language, for email localisation. */
export const getBillingStatus = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireUid(request);
  const locale = request.data?.locale === "ko" ? "ko" : "en";
  const ref = userRef(uid);
  const snap = await ref.get();
  if (snap.get("locale") !== locale) await ref.set({ locale }, { merge: true });
  return toClientEntitlement(snap.data());
});

/** Spends a hosted drill. Throws resource-exhausted (details.reason) when none are left. */
export const startHostedDrill = onCall({ ...CALLABLE_OPTS, secrets: [] }, async (request) => {
  const uid = requireUid(request);
  return startDrill(uid);
});

/**
 * Creates (or switches) a subscription and returns what PaymentSheet needs to confirm it.
 *
 * data: { plan: "plus"|"pro", period: "monthly"|"annual", currency, addOns: [lookupKey] }
 * returns: { clientSecret, intentType: "payment"|"setup"|"none", subscriptionId }
 *
 * "setup" happens when nothing is due today (a trial with no add-ons): the card is saved for
 * when the trial ends. "none" is a plan switch that Stripe settled without the trainee
 * needing to do anything.
 */
export const createSubscriptionCheckout = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireUid(request);
  const plan = String(request.data?.plan || "");
  const period = String(request.data?.period || "");
  const currency = validateCurrency(request.data?.currency);
  const addOns = validateAddOns(request.data?.addOns);
  const lookupKey = PLANS[plan]?.[period];
  if (!lookupKey) throw new HttpsError("invalid-argument", "Unknown plan.");

  const catalog = await prices();
  const customer = await ensureCustomer(uid);
  const userSnap = await userRef(uid).get();

  const existing = await liveSubscription(customer);
  if (existing) {
    // Plan switch (e.g. Plus -> Pro). Stripe prorates; the currency of an existing subscription
    // can't change, so the switch stays in whatever currency it started in.
    const item = existing.items.data[0];
    const updated = await stripe().subscriptions.update(existing.id, {
      items: [{ id: item.id, price: catalog.get(lookupKey).id }],
      proration_behavior: "always_invoice",
      payment_behavior: "default_incomplete",
      metadata: { ...existing.metadata, uid, plan, period },
      expand: ["latest_invoice.confirmation_secret"],
    });
    const secret = updated.latest_invoice?.status === "open" ? updated.latest_invoice?.confirmation_secret?.client_secret : null;
    return { clientSecret: secret || null, intentType: secret ? "payment" : "none", subscriptionId: updated.id };
  }

  // Abandoned checkouts leave `incomplete` subscriptions behind; clear them so they don't pile up
  // or get confused with the one being created now.
  const stale = await stripe().subscriptions.list({ customer, status: "incomplete", limit: 10 });
  await Promise.all(stale.data.map((s) => stripe().subscriptions.cancel(s.id).catch(() => null)));

  const withTrial = plan === "plus" && !userSnap.get("trialUsed");
  const sub = await stripe().subscriptions.create({
    customer,
    currency,
    items: [{ price: catalog.get(lookupKey).id }],
    // Popcorn add-ons ride on the first invoice and are charged today, even during a trial.
    add_invoice_items: addOns.map((key) => ({ price: catalog.get(key).id, quantity: 1 })),
    trial_period_days: withTrial ? PLUS_TRIAL_DAYS : undefined,
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    // Ends a trial cleanly if no card was saved, instead of leaving an unpaid sub around.
    trial_settings: withTrial ? { end_behavior: { missing_payment_method: "cancel" } } : undefined,
    metadata: { uid, plan, period },
    expand: ["latest_invoice.confirmation_secret", "pending_setup_intent"],
  });

  await userRef(uid).set({ currency }, { merge: true });

  const paymentSecret = sub.latest_invoice?.confirmation_secret?.client_secret;
  if (paymentSecret && sub.latest_invoice.amount_due > 0) {
    return { clientSecret: paymentSecret, intentType: "payment", subscriptionId: sub.id };
  }
  const setupSecret = sub.pending_setup_intent?.client_secret;
  if (setupSecret) {
    return { clientSecret: setupSecret, intentType: "setup", subscriptionId: sub.id };
  }
  return { clientSecret: null, intentType: "none", subscriptionId: sub.id };
});

/** One-off add-on purchase outside of checkout. data: { addOn, currency } */
export const createAddOnPayment = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireUid(request);
  const currency = validateCurrency(request.data?.currency);
  const [addOn] = validateAddOns([request.data?.addOn]);
  if (!addOn) throw new HttpsError("invalid-argument", "Missing add-on.");

  const price = (await prices()).get(addOn);
  const customer = await ensureCustomer(uid);
  const intent = await stripe().paymentIntents.create({
    amount: amountIn(price, currency),
    currency,
    customer,
    automatic_payment_methods: { enabled: true },
    // The webhook credits the add-on from this metadata — and only once the payment succeeds.
    metadata: { uid, addOn },
    description: price.nickname || addOn,
  });
  return { clientSecret: intent.client_secret, intentType: "payment" };
});

/**
 * Cancel, or accept the exit offer instead. data: { acceptRetentionOffer: boolean }
 *
 * Cancelling is always at period end — the trainee keeps what they've paid for. The exit offer
 * is once per account, ever; a second attempt gets a plain cancel.
 */
export const cancelSubscription = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireUid(request);
  const accept = request.data?.acceptRetentionOffer === true;
  const ref = userRef(uid);
  const snap = await ref.get();
  const customer = snap.get("stripeCustomerId");
  const sub = customer ? await liveSubscription(customer) : null;
  if (!sub) throw new HttpsError("failed-precondition", "No active subscription.");

  if (accept) {
    if (snap.get("retentionOfferUsed")) throw new HttpsError("failed-precondition", "Offer already used.");
    await ensureRetentionCoupon();
    await stripe().subscriptions.update(sub.id, {
      discounts: [{ coupon: RETENTION_COUPON_ID }],
      cancel_at_period_end: false,
    });
    await ref.set({ retentionOfferUsed: true, discountActive: true, cancelAtPeriodEnd: false }, { merge: true });
  } else {
    await stripe().subscriptions.update(sub.id, { cancel_at_period_end: true });
    await ref.set({ cancelAtPeriodEnd: true }, { merge: true });
  }
  return toClientEntitlement((await ref.get()).data());
});

/** Undo a pending cancellation. */
export const resumeSubscription = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireUid(request);
  const ref = userRef(uid);
  const customer = (await ref.get()).get("stripeCustomerId");
  const sub = customer ? await liveSubscription(customer) : null;
  if (!sub) throw new HttpsError("failed-precondition", "No active subscription.");
  await stripe().subscriptions.update(sub.id, { cancel_at_period_end: false });
  await ref.set({ cancelAtPeriodEnd: false }, { merge: true });
  return toClientEntitlement((await ref.get()).data());
});

/**
 * Dunning, the trainee's half: returns the client secret of the unpaid renewal invoice so the
 * app can pay it with a new card or Google Pay right now, instead of waiting for Stripe's next
 * automatic retry. The new method becomes the subscription default (save_default_payment_method).
 */
export const retryFailedPayment = onCall(CALLABLE_OPTS, async (request) => {
  const uid = requireUid(request);
  const customer = (await userRef(uid).get()).get("stripeCustomerId");
  const sub = customer ? await liveSubscription(customer) : null;
  if (!sub) throw new HttpsError("failed-precondition", "No active subscription.");
  const invoices = await stripe().invoices.list({
    subscription: sub.id,
    status: "open",
    limit: 1,
    expand: ["data.confirmation_secret"],
  });
  const secret = invoices.data[0]?.confirmation_secret?.client_secret;
  if (!secret) throw new HttpsError("failed-precondition", "Nothing to pay.");
  return { clientSecret: secret, intentType: "payment" };
});

// ---------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------

const STATUS_MAP = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  // Retries exhausted but not yet cancelled (depends on the dashboard's dunning setting).
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "NONE",
  incomplete_expired: "NONE",
  paused: "CANCELED",
};

async function uidForCustomer(customerId) {
  const q = await db().collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
  if (!q.empty) return q.docs[0].id;
  const customer = await stripe().customers.retrieve(customerId);
  return customer?.metadata?.uid || null;
}

/**
 * Mirrors a subscription into users/{uid}. Always re-fetches from Stripe rather than trusting
 * the event payload, because Stripe doesn't guarantee event order — a late `incomplete` event
 * must not overwrite an `active` one.
 */
async function syncSubscription(subscriptionId) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const uid = sub.metadata?.uid || (await uidForCustomer(sub.customer));
  if (!uid) {
    console.error(`No uid for subscription ${sub.id}`);
    return;
  }

  // A stale incomplete/expired subscription must not clobber a live one on the same customer.
  const live = await liveSubscription(sub.customer);
  if (live && live.id !== sub.id) return;

  const item = sub.items.data[0];
  const mapped = planForLookupKey(item?.price?.lookup_key) || { plan: sub.metadata?.plan, period: sub.metadata?.period };
  const status = STATUS_MAP[sub.status] || "NONE";

  const update = {
    plan: status === "NONE" || status === "CANCELED" ? "FREE" : String(mapped.plan || "free").toUpperCase(),
    period: mapped.period ? String(mapped.period).toUpperCase() : null,
    status,
    subscriptionId: sub.id,
    trialEndsAt: sub.trial_end ? sub.trial_end * 1000 : 0,
    currentPeriodEnd: (item?.current_period_end || sub.current_period_end || 0) * 1000,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    discountActive: (sub.discounts?.length || 0) > 0 || !!sub.discount,
  };
  if (sub.trial_end) update.trialUsed = true;
  await userRef(uid).set(update, { merge: true });
}

async function creditInvoice(invoice, eventId) {
  const subId = invoiceSubscriptionId(invoice);
  let uid = null;
  if (subId) {
    const sub = await stripe().subscriptions.retrieve(subId);
    uid = sub.metadata?.uid;
  }
  uid = uid || (await uidForCustomer(invoice.customer));
  if (!uid) return;

  const catalog = await prices();
  const keyById = new Map([...catalog.values()].map((p) => [p.id, p.lookup_key]));

  let bonusDrills = 0;
  let streakFreezes = 0;
  for (const line of invoice.lines?.data || []) {
    const key = keyById.get(linePriceId(line));
    if (ADD_ONS[key]) {
      const qty = line.quantity || 1;
      bonusDrills += ADD_ONS[key].bonusDrills * qty;
      streakFreezes += ADD_ONS[key].streakFreezes * qty;
    }
    // Pro perk: freezes for every paid month (12 months' worth up front on annual).
    const plan = planForLookupKey(key);
    if (plan?.plan === "pro" && invoice.amount_paid > 0 && ["subscription_create", "subscription_cycle"].includes(invoice.billing_reason)) {
      streakFreezes += PRO_MONTHLY_STREAK_FREEZES * (plan.period === "annual" ? 12 : 1);
    }
  }
  await grantCredits(uid, { bonusDrills, streakFreezes }, eventId);
}

export const stripeWebhook = onRequest(
  { region: "us-central1", secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], maxInstances: 10, cors: false },
  async (req, res) => {
    let event;
    try {
      event = stripe().webhooks.constructEvent(req.rawBody, req.get("stripe-signature"), STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      res.status(400).send("Bad signature");
      return;
    }

    try {
      const obj = event.data.object;
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await syncSubscription(obj.id);
          break;

        // Fires 3 days before a trial converts. The email exists so nobody is surprised by the
        // first charge — the most common source of refund requests and chargebacks.
        case "customer.subscription.trial_will_end": {
          const uid = obj.metadata?.uid || (await uidForCustomer(obj.customer));
          if (uid) {
            const item = obj.items?.data?.[0];
            const currency = obj.currency;
            const amount = item?.price ? await formatPlanAmount(item.price.lookup_key, currency) : "";
            await queueEmail(uid, "trial_ending", { date: obj.trial_end, amount }, obj.id);
          }
          break;
        }

        // Stripe's Smart Retries re-attempt the charge on their own schedule (configured in the
        // dashboard); this just tells the trainee, and the app shows a fix-it banner meanwhile.
        case "invoice.payment_failed": {
          const subId = invoiceSubscriptionId(obj);
          if (subId) await syncSubscription(subId);
          const uid = await uidForCustomer(obj.customer);
          if (uid && obj.billing_reason !== "subscription_create") {
            await queueEmail(uid, "payment_failed", { nextAttempt: obj.next_payment_attempt }, `${obj.id}_${obj.attempt_count}`);
          }
          break;
        }

        case "invoice.paid": {
          await creditInvoice(obj, event.id);
          const subId = invoiceSubscriptionId(obj);
          if (subId) await syncSubscription(subId);
          break;
        }

        // Standalone add-on purchases (createAddOnPayment). Invoice payments don't carry this
        // metadata, so subscription add-ons aren't double-credited here.
        case "payment_intent.succeeded": {
          const { uid, addOn } = obj.metadata || {};
          if (uid && ADD_ONS[addOn]) {
            await grantCredits(uid, ADD_ONS[addOn], event.id);
          }
          break;
        }

        default:
          break;
      }
      res.status(200).send("ok");
    } catch (err) {
      // 500 makes Stripe retry; every handler above is idempotent, so that's safe.
      console.error(`Webhook ${event.type} ${event.id} failed:`, err?.message);
      res.status(500).send("error");
    }
  }
);

async function formatPlanAmount(lookupKey, currency) {
  const price = (await prices()).get(lookupKey);
  if (!price) return "";
  const minor = amountIn(price, currency);
  const zeroDecimal = currency === "krw";
  return new Intl.NumberFormat(currency === "krw" ? "ko-KR" : currency === "zar" ? "en-ZA" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(zeroDecimal ? minor : minor / 100);
}
