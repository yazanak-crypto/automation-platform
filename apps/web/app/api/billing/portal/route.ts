import { db, subscriptions } from "@platform/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { appUrl, billingConfigured, stripe } from "@/lib/stripe";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/** Stripe billing portal: manage/cancel/change plan, update card. */
export async function POST() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });
  }
  const sub = await db()
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, ctx.workspace.id))
    .limit(1);
  if (!sub[0]) return NextResponse.json({ error: "No subscription yet" }, { status: 404 });
  const session = await stripe().billingPortal.sessions.create({
    customer: sub[0].customerId,
    return_url: `${appUrl()}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
