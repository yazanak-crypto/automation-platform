import { getCreditStatus, PLANS } from "@platform/core";

/**
 * What the sidebar badge should say for a workspace.
 *
 * Wraps getCreditStatus so the layout does not have to know how entitlement is
 * derived — only that this is the one place that knows. Returns the plan id
 * (for styling), its customer-facing name (`pro` → "Premium", never "pro"), and
 * the trial countdown when one is running.
 *
 * The `source` field on CreditStatus is deliberately NOT surfaced: whether a
 * customer paid by card or by bank transfer is internal accounting, and their
 * plan is the same either way.
 */
export interface PlanBadgeData {
  plan: string;
  label: string;
  trialDaysLeft: number | null;
}

export async function planBadge(workspaceId: string): Promise<PlanBadgeData | null> {
  try {
    const status = await getCreditStatus(workspaceId);
    const plan = status.plan;
    const label = PLANS[plan]?.name ?? "Free trial";

    let trialDaysLeft: number | null = null;
    if (plan === "trial" && status.trialEndsAt && !status.trialEnded) {
      const ms = new Date(status.trialEndsAt).getTime() - Date.now();
      // Round UP so the final partial day reads "1 day left" rather than "0".
      trialDaysLeft = Math.max(1, Math.ceil(ms / 86_400_000));
    }

    return { plan, label, trialDaysLeft };
  } catch (err) {
    // The badge is decoration; the app shell is not. A Redis or database blip
    // must not 500 every authenticated page just to avoid rendering a chip.
    console.error("[plan-badge] read failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
