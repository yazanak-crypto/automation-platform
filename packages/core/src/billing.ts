import { aiCalls, db, subscriptions, workspaces } from "@platform/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { redis } from "./queues";

// Usage-based billing (Decision 001 model, Step 9). One AI credit = $0.01 of
// estimated AI cost (10,000 microcents), consumption computed straight from
// the ai_calls ledger — the gateway's numbers ARE the billing numbers.

export const MICROCENTS_PER_CREDIT = 10_000;

export const PLANS = {
  trial: { name: "Trial", monthlyCredits: 300, priceMonthlyUsd: 0 },
  starter: { name: "Starter", monthlyCredits: 2_000, priceMonthlyUsd: 49 },
  pro: { name: "Pro", monthlyCredits: 10_000, priceMonthlyUsd: 149 },
} as const;
export type PlanId = keyof typeof PLANS;

export function isPlanId(v: string): v is PlanId {
  return v in PLANS;
}

export function creditsFromMicrocents(microcents: number): number {
  return Math.ceil(microcents / MICROCENTS_PER_CREDIT);
}

export interface CreditStatus {
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
      return { ...parsed, periodStart: new Date(parsed.periodStart), periodEnd: new Date(parsed.periodEnd) };
    }
  }

  const subRows = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  const sub = subRows[0];

  const active = sub && (sub.status === "active" || sub.status === "trialing") && isPlanId(sub.plan);
  const plan: PlanId = active ? (sub.plan as PlanId) : "trial";
  const period =
    active && sub.currentPeriodStart && sub.currentPeriodEnd
      ? { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
      : calendarPeriod();

  const usage = await db()
    .select({ microcents: sql<number>`coalesce(sum(${aiCalls.estimatedCostMicrocents}), 0)::int` })
    .from(aiCalls)
    .where(and(eq(aiCalls.workspaceId, workspaceId), gte(aiCalls.createdAt, period.start)));

  const allowance = PLANS[plan].monthlyCredits;
  const used = creditsFromMicrocents(usage[0]?.microcents ?? 0);
  const status: CreditStatus = {
    plan,
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
    exhausted: used >= allowance,
    periodStart: period.start,
    periodEnd: period.end,
    subscriptionStatus: sub?.status ?? null,
  };

  await redis().set(cacheKey, JSON.stringify(status), "EX", 60).catch(() => {});
  return status;
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
