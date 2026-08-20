import { conversationsFromCredits, getCreditStatus, PLANS } from "@platform/core";
import { NextResponse } from "next/server";
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
      purchasable: id !== "trial" && billingConfigured() && !!priceIdForPlan(id as "starter" | "pro"),
    })),
    billingConfigured: billingConfigured(),
  });
}
