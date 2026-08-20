import { isPlanId } from "@platform/core";
import { db, subscriptions } from "@platform/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  paddle,
  paddleErrorInfo,
  paddlePriceForPlan,
  paddleSetupPriceForPlan,
  paymentProvider,
} from "@/lib/paddle";
import { appUrl, billingConfigured, priceIdForPlan, setupPriceIdForPlan, stripe } from "@/lib/stripe";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

const bodySchema = z.object({ plan: z.enum(["starter", "pro"]) });

/**
 * Start a checkout for a plan upgrade.
 *
 * The plan and the workspace binding are decided HERE, server-side, and travel
 * in the transaction's custom_data. The browser only receives an opaque
 * transaction id — it never names a price, so it cannot pick a cheaper one or
 * attach the purchase to another workspace.
 */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success || !isPlanId(parsed.data.plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  const plan = parsed.data.plan;

  const existing = await db()
    .select({ customerId: subscriptions.providerCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, ctx.workspace.id))
    .limit(1);

  const provider = paymentProvider();

  if (provider === "paddle") {
    const setupPriceId = paddleSetupPriceForPlan(plan);
    const recurringPriceId = paddlePriceForPlan(plan);
    if (!setupPriceId || !recurringPriceId) {
      return NextResponse.json({ error: "Plan not available yet." }, { status: 503 });
    }

    // One transaction, two items: the setup fee is charged now and the
    // subscription is created in its 30-day trial, so the first monthly charge
    // lands on day 31. The trial length lives on the recurring price in Paddle.
    //
    // Wrapped because a Paddle-side failure here is usually a DASHBOARD
    // misconfiguration, not a transient fault — a missing default payment link,
    // an archived price, a revoked key. Unwrapped, all of those looked like an
    // identical bare 500 with an empty body, and the only way to tell them apart
    // was pulling runtime logs. The SDK's error code is the diagnosis, so log it.
    let transaction;
    try {
      transaction = await paddle().transactions.create({
        items: [
          { priceId: setupPriceId, quantity: 1 },
          { priceId: recurringPriceId, quantity: 1 },
        ],
        customData: { workspaceId: ctx.workspace.id, plan },
        ...(existing[0]?.customerId ? { customerId: existing[0].customerId } : {}),
      });
    } catch (err) {
      const info = paddleErrorInfo(err);
      console.error(
        `[billing.checkout] paddle transactions.create failed ` +
          `(workspace ${ctx.workspace.id}, plan ${plan}): ` +
          (info ? `${info.code} — ${info.detail}` : String(err)),
      );
      // 502, not 500: the failure is upstream, and it is not the caller's fault.
      // The message points at the bank-transfer path at /checkout, which works
      // regardless of Paddle's state, so the customer is never simply stuck.
      // `code` rides along for support without being rendered to the customer.
      return NextResponse.json(
        {
          error:
            "Card payment isn’t available right now. You can pay by bank transfer instead, or try again shortly.",
          code: info?.code ?? "paddle_error",
        },
        { status: 502 },
      );
    }

    // Paddle.js opens this; there is no hosted URL to redirect to.
    return NextResponse.json({ provider: "paddle", transactionId: transaction.id });
  }

  if (provider === "stripe") {
    if (!billingConfigured()) {
      return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
    }
    const recurringPriceId = priceIdForPlan(plan);
    const setupPriceId = setupPriceIdForPlan(plan);
    if (!recurringPriceId || !setupPriceId) {
      return NextResponse.json({ error: "Plan not available yet." }, { status: 503 });
    }
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      ...(existing[0]?.customerId
        ? { customer: existing[0].customerId }
        : { customer_creation: "always", customer_email: ctx.user.email }),
      line_items: [{ price: setupPriceId, quantity: 1 }],
      payment_intent_data: { setup_future_usage: "off_session" },
      metadata: { workspaceId: ctx.workspace.id, plan },
      success_url: `${appUrl()}/billing?upgraded=1`,
      cancel_url: `${appUrl()}/billing`,
      allow_promotion_codes: true,
    });
    return NextResponse.json({ provider: "stripe", url: session.url });
  }

  // Neither provider configured — the manual bank/Whish path at /checkout is
  // the intended route, and the billing page links there by default.
  return NextResponse.json({ error: "Card payment isn't available yet." }, { status: 503 });
}
