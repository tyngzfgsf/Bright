/**
 * One-time (and re-runnable) Stripe catalog setup: Products, Prices with lookup keys and
 * per-currency amounts, and the exit-offer coupon. Run against TEST mode first:
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run setup-stripe
 *
 * Idempotent: a lookup key that already has an active Price is left alone. Stripe Prices are
 * immutable, so to change an amount, create a new Price and move the lookup key to it
 * (`transfer_lookup_key: true`) — this script does that with --reprice.
 *
 * Amounts must match shared/.../domain/billing/Pricing.kt. Minor units (cents; whole won).
 */

import Stripe from "stripe";
import { RETENTION_COUPON_ID, RETENTION_MONTHS, RETENTION_PERCENT_OFF } from "../billing/catalog.js";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (use an sk_test_ key first).");
  process.exit(1);
}
const stripe = new Stripe(key);
const reprice = process.argv.includes("--reprice");

// usd is the Price's default currency; zar and krw are currency_options.
const CATALOG = [
  {
    product: "Bright Plus",
    description: "Unlimited AI emergency drills and custom scenarios.",
    prices: [
      { lookup_key: "plus_monthly", interval: "month", usd: 299, zar: 4900, krw: 3500 },
      { lookup_key: "plus_annual", interval: "year", usd: 2990, zar: 49000, krw: 35000 },
    ],
  },
  {
    product: "Bright Pro",
    description: "Everything in Plus, an expert debrief after every case, and monthly streak freezes.",
    prices: [
      { lookup_key: "pro_monthly", interval: "month", usd: 599, zar: 9900, krw: 7900 },
      { lookup_key: "pro_annual", interval: "year", usd: 5990, zar: 99000, krw: 79000 },
    ],
  },
  {
    product: "Drill pack (+20)",
    description: "20 extra AI drills that never expire.",
    prices: [{ lookup_key: "addon_drill_pack", usd: 129, zar: 2500, krw: 2000 }],
  },
  {
    product: "Streak freezes (×3)",
    description: "Each one keeps your streak alive through a missed day.",
    prices: [{ lookup_key: "addon_streak_freezes", usd: 79, zar: 1500, krw: 1000 }],
  },
];

async function findProduct(name) {
  const res = await stripe.products.search({ query: `name:'${name.replace(/'/g, "\\'")}' AND active:'true'` });
  return res.data[0] || null;
}

for (const entry of CATALOG) {
  const product =
    (await findProduct(entry.product)) ||
    (await stripe.products.create({ name: entry.product, description: entry.description }));

  for (const p of entry.prices) {
    const existing = (await stripe.prices.list({ lookup_keys: [p.lookup_key], active: true })).data[0];
    if (existing && !reprice) {
      console.log(`✓ ${p.lookup_key} exists (${existing.id})`);
      continue;
    }
    const price = await stripe.prices.create({
      product: product.id,
      lookup_key: p.lookup_key,
      transfer_lookup_key: true,
      nickname: entry.product,
      currency: "usd",
      unit_amount: p.usd,
      currency_options: { zar: { unit_amount: p.zar }, krw: { unit_amount: p.krw } },
      recurring: p.interval ? { interval: p.interval } : undefined,
    });
    if (existing) await stripe.prices.update(existing.id, { active: false });
    console.log(`+ ${p.lookup_key} -> ${price.id}`);
  }
}

try {
  await stripe.coupons.retrieve(RETENTION_COUPON_ID);
  console.log(`✓ coupon ${RETENTION_COUPON_ID} exists`);
} catch {
  await stripe.coupons.create({
    id: RETENTION_COUPON_ID,
    percent_off: RETENTION_PERCENT_OFF,
    duration: "repeating",
    duration_in_months: RETENTION_MONTHS,
    name: `${RETENTION_PERCENT_OFF}% off for ${RETENTION_MONTHS} months`,
  });
  console.log(`+ coupon ${RETENTION_COUPON_ID}`);
}

console.log("\nDone. Remaining dashboard steps are in MONETIZATION.md (webhook, Smart Retries, emails).");
