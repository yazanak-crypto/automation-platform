import { getCreditStatus, PLANS } from "@platform/core";
import { NextResponse } from "next/server";
import { paddlePriceForPlan, paddleSetupPriceForPlan, paymentProvider } from "@/lib/paddle";
import { billingConfigured, priceIdForPlan } from "@/lib/stripe";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const status = await getCreditStatus(ctx.workspace.id);
  return NextResponse.json({
    status,
    plans: Object.entries(PLANS).map(([id, p]) => ({
      id,
      name: p.name,
      monthlyCredits: p.monthlyCredits,
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
    billingConfigured: billingConfigured(),
  });
}
