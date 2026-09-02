import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import type { PlanId } from "@platform/core";

// Paddle Billing. Paddle is the merchant of record, so it sells to the customer
// and handles tax — see the terms/refund pages before going live.
//
// The shape of our offer, and why it is ONE checkout with TWO items:
//   • setup price   — one-time, charged today, covers month one
//   • recurring     — monthly, with a 30-DAY TRIAL configured ON THE PRICE
//
// Paddle cannot create a subscription from the API: subscriptions only come
// into existence when a customer completes a checkout containing a recurring
// price, and trial length lives on the price object. So the Stripe pattern
// (charge now, create the subscription later from the webhook) has no
// equivalent here. Both items ride in one transaction, which Paddle allows —
// the only restriction is that RECURRING items must share a billing interval.
//
// ⚠️ If the recurring price does NOT have a 30-day trial set in Paddle, the
// customer is charged setup + monthly on day one ($898 on Starter). That is a
// dashboard configuration failure with no runtime signal in this codebase, so
// `pnpm paddle:verify` (scripts/paddle-verify.ts) checks all four prices
// against PLANS via the Paddle API. Run it after any price change, and before
// switching PADDLE_ENV to production.

export function paddleConfigured(): boolean {
  return !!(process.env.PADDLE_API_KEY && process.env.PADDLE_WEBHOOK_SECRET);
}

/** Which provider is live. Paddle wins when both are configured. */
export function paymentProvider(): "paddle" | "stripe" | null {
  if (paddleConfigured()) return "paddle";
  if (process.env.BILLING_ENABLED === "true" && process.env.STRIPE_SECRET_KEY) return "stripe";
  return null;
}

let _paddle: Paddle | undefined;
export function paddle(): Paddle {
  if (!process.env.PADDLE_API_KEY) throw new Error("Paddle not configured");
  _paddle ??= new Paddle(process.env.PADDLE_API_KEY, {
    environment:
      process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
  return _paddle;
}

/**
 * The recurring Paddle price id for each payable plan, read from env.
 *
 * One table, three uses (forward, setup, reverse) so a new plan cannot be added
 * to two of them and forgotten in the third — which is how a price ends up
 * sellable at checkout but unrecognised by reconciliation.
 *
 * ⚠️ Only `entry` has a setup price. The other plans are month-to-month with no
 * upfront charge, so their setup entry is null by design, not by omission.
 */
const PADDLE_PRICE_ENV: Record<Exclude<PlanId, "trial">, { recurring: string; setup: string | null }> =
  {
    entry: { recurring: "PADDLE_PRICE_ENTRY", setup: "PADDLE_PRICE_ENTRY_SETUP" },
    starter: { recurring: "PADDLE_PRICE_STARTER", setup: null },
    growth: { recurring: "PADDLE_PRICE_GROWTH", setup: null },
    pro: { recurring: "PADDLE_PRICE_PRO", setup: null },
  };

/** Recurring price — the subscription item. */
export function paddlePriceForPlan(plan: PlanId): string | null {
  if (plan === "trial") return null;
  return process.env[PADDLE_PRICE_ENV[plan].recurring] ?? null;
}

/** One-time setup price — charged today, covers the first month. */
export function paddleSetupPriceForPlan(plan: PlanId): string | null {
  if (plan === "trial") return null;
  const key = PADDLE_PRICE_ENV[plan].setup;
  return key ? (process.env[key] ?? null) : null;
}

/** Reverse lookup for webhooks: which plan does this recurring price sell? */
export function planForPaddlePrice(priceId: string): PlanId | null {
  if (!priceId) return null;
  for (const [plan, keys] of Object.entries(PADDLE_PRICE_ENV)) {
    const configured = process.env[keys.recurring];
    if (configured && configured === priceId) return plan as PlanId;
  }
  return null;
}

/**
 * Paddle statuses map onto ours directly. `trialing` entitles just like
 * `active` — during the first 30 days the customer has paid the setup fee and
 * is mid-trial on the recurring price, so they are a paying customer.
 */
export function isEntitlingPaddleStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

/** The machine-readable fields the Paddle SDK attaches to an API failure. */
export interface PaddleErrorInfo {
  code: string;
  detail: string;
}

/**
 * Pull `code`/`detail` off a thrown Paddle error.
 *
 * Worth having because the alternative is what actually happened: a checkout
 * 500'd with nothing in the response and nothing in the logs, and diagnosing
 * "no default payment link is set on the account" took a Vercel log pull. The
 * SDK hands us a stable error code — discarding it is throwing away the only
 * part of the failure that says what to go and fix.
 *
 * Duck-typed rather than instanceof: the SDK's error class is not exported, and
 * a shape check keeps this working across SDK versions.
 */
export function paddleErrorInfo(err: unknown): PaddleErrorInfo | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; detail?: unknown };
  if (typeof e.code !== "string" || !e.code) return null;
  return { code: e.code, detail: typeof e.detail === "string" ? e.detail : "" };
}
