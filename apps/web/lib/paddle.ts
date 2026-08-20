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
// configuration failure with no code signal, so verifyPaddlePrices() below
// exists to catch it before a customer does.

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

/** Recurring price — the subscription item. */
export function paddlePriceForPlan(plan: PlanId): string | null {
  if (plan === "starter") return process.env.PADDLE_PRICE_STARTER ?? null;
  if (plan === "pro") return process.env.PADDLE_PRICE_PRO ?? null;
  return null;
}

/** One-time setup price — charged today, covers the first month. */
export function paddleSetupPriceForPlan(plan: PlanId): string | null {
  if (plan === "starter") return process.env.PADDLE_PRICE_STARTER_SETUP ?? null;
  if (plan === "pro") return process.env.PADDLE_PRICE_PRO_SETUP ?? null;
  return null;
}

/** Reverse lookup for webhooks: which plan does this recurring price sell? */
export function planForPaddlePrice(priceId: string): PlanId | null {
  if (priceId && priceId === process.env.PADDLE_PRICE_STARTER) return "starter";
  if (priceId && priceId === process.env.PADDLE_PRICE_PRO) return "pro";
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
