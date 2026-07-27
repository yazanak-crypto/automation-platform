import { aiCalls, db, subscriptions, workspaces } from "@platform/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { redis } from "./queues";

// Usage-based billing (Decision 001 model, Step 9). One AI credit = $0.01 of
// estimated AI cost (10,000 microcents), consumption computed straight from
// the ai_calls ledger — the gateway's numbers ARE the billing numbers.

export const MICROCENTS_PER_CREDIT = 10_000;

export const PLANS = {
  // 7-day free trial; the credit ceiling is a quiet anti-abuse cap, not the gate.
  trial: { name: "Free trial", monthlyCredits: 300, priceMonthlyUsd: 0, setupFeeUsd: 0 },
  starter: { name: "Starter", monthlyCredits: 2_000, priceMonthlyUsd: 49, setupFeeUsd: 119 },
  pro: { name: "Premium", monthlyCredits: 10_000, priceMonthlyUsd: 149, setupFeeUsd: 219 },
} as const;
export type PlanId = keyof typeof PLANS;

export function isPlanId(v: string): v is PlanId {
  return v in PLANS;
}

/**
 * Master switch for paid billing. While false (the default), all Stripe code
 * stays in place but is inert: nothing expires, nothing is blocked for payment,
 * and no checkout is offered. Flip BILLING_ENABLED=true once a registered
 * company + live Stripe keys exist.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
}

/**
 * When billing is off, no workspace is ever payment-blocked. Applied at the one
 * chokepoint every downstream gate reads (worker drafting, AI previews,
 * dashboard banners), so none of them need their own flag check.
 */
function withBillingFlag(status: CreditStatus): CreditStatus {
  if (billingEnabled()) return status;
  return { ...status, exhausted: false, trialEnded: false };
}

export function creditsFromMicrocents(microcents: number): number {
  return Math.ceil(microcents / MICROCENTS_PER_CREDIT);
}

export interface CreditStatus {
  /** Set when the workspace is on trial: when it ends / whether it has ended. */
  trialEndsAt: string | null;
  trialEnded: boolean;
  plan: PlanId;
  allowance: number;
  used: number;
  remaining: number;
  exhausted: boolean;
  periodStart: Date;
  periodEnd: Date;
  subscriptionStatus: string | null;
}

/** Calendar-month period for trial workspaces (no Stripe period to anchor to). */
function calendarPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function getCreditStatus(
  workspaceId: string,
  opts: { skipCache?: boolean } = {},
): Promise<CreditStatus> {
  const cacheKey = `credits:${workspaceId}`;
  if (!opts.skipCache) {
    const cached = await redis().get(cacheKey).catch(() => null);
    if (cached) {
      const parsed = JSON.parse(cached) as CreditStatus & { periodStart: string; periodEnd: string };
      return withBillingFlag({
        ...parsed,
        periodStart: new Date(parsed.periodStart),
        periodEnd: new Date(parsed.periodEnd),
      });
    }
  }

  const wsRows = await db()
    .select({
      trialEndsAt: workspaces.trialEndsAt,
      wsPlan: workspaces.plan,
      paidThrough: workspaces.paidThrough,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const subRows = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  const sub = subRows[0];

  // Manual (bank/Whish) access runs alongside Stripe — whichever grants access
  // wins. A confirmed or provisional manual payment sets workspaces.plan +
  // paid_through; while paid_through is in the future that plan is live.
  const paidThrough = wsRows[0]?.paidThrough ?? null;
  const manualActive =
    !!paidThrough && paidThrough.getTime() > Date.now() && isPlanId(wsRows[0]?.wsPlan ?? "");

  const stripeActive =
    sub && (sub.status === "active" || sub.status === "trialing") && isPlanId(sub.plan);
  const plan: PlanId = manualActive
    ? (wsRows[0]!.wsPlan as PlanId)
    : stripeActive
      ? (sub.plan as PlanId)
      : "trial";
  const period = manualActive
    ? calendarPeriod()
    : stripeActive && sub.currentPeriodStart && sub.currentPeriodEnd
      ? { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
      : calendarPeriod();

  const usage = await db()
    .select({ microcents: sql<number>`coalesce(sum(${aiCalls.estimatedCostMicrocents}), 0)::int` })
    .from(aiCalls)
    .where(and(eq(aiCalls.workspaceId, workspaceId), gte(aiCalls.createdAt, period.start)));

  const allowance = PLANS[plan].monthlyCredits;
  const used = creditsFromMicrocents(usage[0]?.microcents ?? 0);

  // Trial workspaces are time-gated (7 days). null trialEndsAt = legacy/no
  // expiry, treated as active for safety.
  const trialEndsAt = plan === "trial" ? (wsRows[0]?.trialEndsAt ?? null) : null;
  const trialEnded = plan === "trial" && !!trialEndsAt && trialEndsAt.getTime() < Date.now();
  const status: CreditStatus = {
    plan,
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
    exhausted: trialEnded || used >= allowance,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    trialEnded,
    periodStart: period.start,
    periodEnd: period.end,
    subscriptionStatus: sub?.status ?? null,
  };

  await redis().set(cacheKey, JSON.stringify(status), "EX", 60).catch(() => {});
  return withBillingFlag(status);
}

export async function invalidateCreditCache(workspaceId: string) {
  await redis().del(`credits:${workspaceId}`).catch(() => {});
}

/** Upsert from Stripe webhook events — the only writer of subscription state. */
export async function applySubscriptionState(args: {
  workspaceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: PlanId;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}) {
  const existing = await db()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, args.workspaceId))
    .limit(1);
  if (existing[0]) {
    await db()
      .update(subscriptions)
      .set({
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        plan: args.plan,
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing[0].id));
  } else {
    await db().insert(subscriptions).values({
      workspaceId: args.workspaceId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      plan: args.plan,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
    });
  }
  await db()
    .update(workspaces)
    .set({ plan: args.status === "active" || args.status === "trialing" ? args.plan : "trial" })
    .where(eq(workspaces.id, args.workspaceId));
  await invalidateCreditCache(args.workspaceId);
}
