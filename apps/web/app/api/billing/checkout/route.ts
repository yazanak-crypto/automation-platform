import { isPlanId } from "@platform/core";
import { db, subscriptions } from "@platform/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appUrl, billingConfigured, priceIdForPlan, stripe } from "@/lib/stripe";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

const bodySchema = z.object({ plan: z.enum(["starter", "pro"]) });

/** Start a Stripe Checkout session for a plan upgrade. */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success || !isPlanId(parsed.data.plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  const priceId = priceIdForPlan(parsed.data.plan);
  if (!priceId) {
    return NextResponse.json({ error: "Plan not available yet." }, { status: 503 });
  }

  // Reuse the workspace's Stripe customer if one exists.
  const existing = await db()
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, ctx.workspace.id))
    .limit(1);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    ...(existing[0]?.customerId
      ? { customer: existing[0].customerId }
      : { customer_email: ctx.user.email }),
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { workspaceId: ctx.workspace.id } },
    metadata: { workspaceId: ctx.workspace.id },
    success_url: `${appUrl()}/billing?upgraded=1`,
    cancel_url: `${appUrl()}/billing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
