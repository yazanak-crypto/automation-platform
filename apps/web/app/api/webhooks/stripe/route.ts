import { applySubscriptionState, isPlanId, type PlanId } from "@platform/core";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { billingConfigured, planForPriceId, priceIdForPlan, stripe } from "@/lib/stripe";
import { isPlanId as isPlan } from "@platform/core";

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
      // Setup fee paid (payment mode) → NOW create the monthly subscription with
      // a 30-day billing trial, so the first recurring invoice lands after month
      // one (the setup fee covered it). Idempotent on the session id.
      if (session.mode === "payment" && session.metadata?.workspaceId && session.metadata?.plan) {
        const plan = session.metadata.plan;
        const recurringPriceId = isPlan(plan) ? priceIdForPlan(plan) : null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (recurringPriceId && customerId) {
          const pi =
            typeof session.payment_intent === "string"
              ? await stripe().paymentIntents.retrieve(session.payment_intent)
              : null;
          const pm = typeof pi?.payment_method === "string" ? pi.payment_method : undefined;
          const sub = await stripe().subscriptions.create(
            {
              customer: customerId,
              items: [{ price: recurringPriceId }],
              trial_period_days: 30,
              ...(pm ? { default_payment_method: pm } : {}),
              metadata: { workspaceId: session.metadata.workspaceId, plan },
            },
            { idempotencyKey: `sub-${session.id}` },
          );
          await applyFromSubscription(sub);
        }
      } else if (session.subscription) {
        const sub = await stripe().subscriptions.retrieve(session.subscription as string);
        await applyFromSubscription(sub);
      }
      break;
    }
    case "invoice.payment_failed": {
      // A renewal/first charge failed → re-sync the subscription (Stripe marks
      // it past_due/unpaid); credit access reflects the new status immediately.
      const invoice = event.data.object as { subscription?: string | null };
      if (invoice.subscription) {
        const sub = await stripe().subscriptions.retrieve(invoice.subscription);
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
