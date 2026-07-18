import { applySubscriptionState, isPlanId, type PlanId } from "@platform/core";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { billingConfigured, planForPriceId, stripe } from "@/lib/stripe";

// Stripe webhook — signature-verified (AC-4.6), the ONLY writer of
// subscription state. Idempotent by construction (upsert to current state).

export async function POST(req: Request) {
  if (!billingConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await req.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applyFromSubscription(event.data.object);
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.subscription) {
        const sub = await stripe().subscriptions.retrieve(session.subscription as string);
        await applyFromSubscription(sub);
      }
      break;
    }
    default:
      break; // ignore unrelated events
  }
  return NextResponse.json({ received: true });
}

async function applyFromSubscription(sub: Stripe.Subscription) {
  const workspaceId = sub.metadata?.workspaceId;
  if (!workspaceId) return; // not one of ours
  const priceId = sub.items.data[0]?.price?.id;
  const mapped = priceId ? planForPriceId(priceId) : null;
  const plan: PlanId = mapped && isPlanId(mapped) ? mapped : "trial";
  // Period fields moved between Subscription and SubscriptionItem across
  // Stripe API versions — read whichever this account's version provides.
  const periods = (sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    items: { data: { current_period_start?: number; current_period_end?: number }[] };
  });
  const start = periods.current_period_start ?? periods.items.data[0]?.current_period_start;
  const end = periods.current_period_end ?? periods.items.data[0]?.current_period_end;
  await applySubscriptionState({
    workspaceId,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    plan: sub.status === "canceled" ? "trial" : plan,
    status: sub.status,
    currentPeriodStart: start ? new Date(start * 1000) : null,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  });
}
