import { getCreditStatus, PLANS } from "@platform/core";
import { NextResponse } from "next/server";
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
      purchasable: id !== "trial" && billingConfigured() && !!priceIdForPlan(id as "starter" | "pro"),
    })),
    billingConfigured: billingConfigured(),
  });
}
