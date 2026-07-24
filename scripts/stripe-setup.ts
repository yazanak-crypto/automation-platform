/**
 * One-time Stripe product/price setup (TEST MODE). Run: pnpm stripe:setup
 *
 * Idempotent — keyed on price `lookup_key`, so re-running reuses existing
 * prices instead of duplicating. Prints the env lines to paste into .env.
 * Never touches live mode (it uses whatever STRIPE_SECRET_KEY you provide;
 * keep it a sk_test_ key).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";

config({ path: resolve(import.meta.dirname, "..", ".env") });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing in .env");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY is not a test key (sk_test_…).");
  process.exit(1);
}
const stripe = new Stripe(key);

interface Spec {
  env: string;
  lookup: string;
  product: string;
  amount: number; // cents
  recurring: boolean;
}

const SPECS: Spec[] = [
  { env: "STRIPE_PRICE_STARTER_SETUP", lookup: "otto_starter_setup", product: "Ovanth Starter — First payment (setup + month 1)", amount: 11900, recurring: false },
  { env: "STRIPE_PRICE_STARTER", lookup: "otto_starter_sub", product: "Ovanth Starter — Subscription", amount: 4900, recurring: true },
  { env: "STRIPE_PRICE_PRO_SETUP", lookup: "otto_premium_setup", product: "Ovanth Premium — First payment (setup + month 1)", amount: 21900, recurring: false },
  { env: "STRIPE_PRICE_PRO", lookup: "otto_premium_sub", product: "Ovanth Premium — Subscription", amount: 14900, recurring: true },
];

async function ensurePrice(s: Spec): Promise<string> {
  const found = await stripe.prices.list({ lookup_keys: [s.lookup], limit: 1 });
  if (found.data[0]) return found.data[0].id;

  const product = await stripe.products.create({ name: s.product });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: s.amount,
    lookup_key: s.lookup,
    ...(s.recurring ? { recurring: { interval: "month" } } : {}),
  });
  return price.id;
}

(async () => {
  console.log("\nCreating Ovanth prices in Stripe TEST mode…\n");
  const lines: string[] = [];
  for (const s of SPECS) {
    const id = await ensurePrice(s);
    console.log(`  ✓ ${s.product.padEnd(38)} $${(s.amount / 100).toFixed(2)}${s.recurring ? "/mo" : ""}  ${id}`);
    lines.push(`${s.env}=${id}`);
  }
  console.log("\nPaste these into platform/.env:\n");
  console.log(lines.join("\n"));
  console.log(
    "\nThen set your webhook secret: create an endpoint at {APP_URL}/api/webhooks/stripe" +
      "\nin the Stripe dashboard (or `stripe listen --forward-to localhost:3000/api/webhooks/stripe`)" +
      "\nand put its signing secret in STRIPE_WEBHOOK_SECRET.\n",
  );
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
