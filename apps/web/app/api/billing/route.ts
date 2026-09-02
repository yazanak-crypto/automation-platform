import { conversationsFromCredits, getCreditStatus, PLANS } from "@platform/core";
import { NextResponse } from "next/server";
import { paddlePriceForPlan, paddleSetupPriceForPlan, paymentProvider } from "@/lib/paddle";
import { planContact } from "@/lib/plan-contact.server";
import { billingConfigured, priceIdForPlan } from "@/lib/stripe";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const status = await getCreditStatus(ctx.workspace.id);
  return NextResponse.json({
    // Conversation counts are computed HERE, from core, and sent ready to
    // render. The billing page used to keep its own copy of the divisor plus a
    // bare '/ 4' in the usage line — two extra sources of truth that silently
    // ignored any change to the real constant.
    status: {
      ...status,
      conversationsUsed: conversationsFromCredits(status.used),
      conversationsAllowance: conversationsFromCredits(status.allowance),
    },
    plans: Object.entries(PLANS).map(([id, p]) => ({
      id,
      name: p.name,
      monthlyCredits: p.monthlyCredits,
      conversations: conversationsFromCredits(p.monthlyCredits),
      priceMonthlyUsd: p.priceMonthlyUsd,
      setupFeeUsd: p.setupFeeUsd,
      // Card checkout is offered only when a provider is actually wired up for
      // this plan. Otherwise the billing page links to the manual bank/Whish
      // path, which stays the fallback while Paddle verification is pending.
      purchasable:
        id !== "trial" &&
        (paymentProvider() === "paddle"
          ? !!paddlePriceForPlan(id as "starter" | "pro") &&
            !!paddleSetupPriceForPlan(id as "starter" | "pro")
          : billingConfigured() && !!priceIdForPlan(id as "starter" | "pro")),
    })),
    // The plan cards contact a human instead of opening a checkout while
    // Paddle merchant verification is pending. Sent from the server because
    // WHATSAPP_NUMBER is not a NEXT_PUBLIC var — the client cannot read it, and
    // hardcoding a second copy in the client is how the two drift apart.
    planContact: planContact(),
    billingConfigured: billingConfigured(),
    // Whether ANY card provider is live. `billingConfigured` above is the
    // Stripe-only flag and reads false on a working Paddle setup, so it cannot
    // gate provider-neutral UI like the "refresh subscription" action.
    cardBilling: paymentProvider() !== null,
  });
}
