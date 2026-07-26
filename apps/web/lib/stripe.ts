import Stripe from "stripe";
import { billingEnabled, type PlanId } from "@platform/core";

/**
 * Billing is live only when it's explicitly enabled AND keys are present.
 * With BILLING_ENABLED unset, every Stripe entry point (checkout, portal,
 * webhook) stays in the codebase but reports "not configured" and does nothing
 * — so test keys can never strand a customer mid-checkout.
 */
export function billingConfigured(): boolean {
  return billingEnabled() && !!process.env.STRIPE_SECRET_KEY;
}

let _stripe: Stripe | undefined;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured");
  _stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

/** Env-mapped price ids — the only place Stripe prices meet our plan ids. */
export function priceIdForPlan(plan: PlanId): string | null {
  if (plan === "starter") return process.env.STRIPE_PRICE_STARTER ?? null;
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO ?? null;
  return null;
}

export function planForPriceId(priceId: string): PlanId | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

/** One-time AI-implementation setup fee, charged on the first invoice. */
export function setupPriceIdForPlan(plan: PlanId): string | null {
  if (plan === "starter") return process.env.STRIPE_PRICE_STARTER_SETUP ?? null;
  if (plan === "pro") return process.env.STRIPE_PRICE_PRO_SETUP ?? null;
  return null;
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
