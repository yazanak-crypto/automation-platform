import { aiCalls, db, subscriptions, workspaces } from "@platform/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { redis } from "./queues";

// Usage-based billing (Decision 001 model, Step 9). One AI credit = $0.01 of
// estimated AI cost, consumption computed straight from the ai_calls ledger —
// the gateway's numbers ARE the billing numbers.
//
// A microcent is 1e-8 USD (see packages/ai/src/pricing.ts, which converts
// $/MTok to microcents/token by multiplying by 100), so $0.01 = 1e6 microcents.
// This was 10_000 until 2026-07-28, which made a credit worth $0.0001 — every
// allowance was enforced 100x too early, capping a full Starter workspace at
// $0.20 of Anthropic spend instead of $20.
export const MICROCENTS_PER_CREDIT = 1_000_000;

// Credits are an INTERNAL limit only — never shown to customers. Pricing is
// quoted as a monthly price plus a visible one-time setup fee, charged once on
// a workspace's first confirmed payment.
export const PLANS = {
  // 7-day free trial, ONE TIME. The credit ceiling is a quiet anti-abuse cap,
  // not the gate — see trialUsedAt in the workspaces table.
  trial: { name: "Free trial", monthlyCredits: 75, priceMonthlyUsd: 0, setupFeeUsd: 0 },
  // The setup fee IS month one: it is charged today and covers the first 30
  // days, then the monthly price starts on day 31. Every surface that quotes
  // money reads these numbers, so they are the only place to change a price —
  // EXCEPT the payment provider's own price objects, which are what actually
  // gets charged. Keep them in step or the site quotes one figure and the card
  // is charged another.
  starter: { name: "Starter", monthlyCredits: 4_000, priceMonthlyUsd: 399, setupFeeUsd: 499 },
  pro: { name: "Premium", monthlyCredits: 8_000, priceMonthlyUsd: 599, setupFeeUsd: 799 },
} as const;

// The ONLY customer-facing unit is a conversation; credits never appear in the
// UI. This is the single conversion used by every surface that quotes a count
// (landing pricing grid, checkout, in-app billing, low-balance banner) — it was
// duplicated as a bare `/ 4` in all four, which let the quoted numbers drift
// apart from each other and from the plan table.
//
// Set from MEASURED cost, not a guess. Production ai_calls (8 real runs,
// prompt webchat/draft-reply v3, claude-sonnet-5) average 1,087 tokens in and
// 199 out = 624,638 microcents, i.e. $0.0062 per conversation — about
// two-thirds of a cent. The divisor was 8 ($0.08), roughly 13x too pessimistic,
// which advertised a fraction of what the plans can actually deliver.
//
// This is deliberately set to 2 ($0.02) rather than the measured 0.62, because
// those 8 runs are a FLOOR, not a typical case: every one ran against an empty
// Business Brain and most escalated instead of composing an answer. A populated
// brain sends a much larger context pack and writes longer replies, and the
// boundary check is not currently firing (1.00 calls per run) but is designed
// to. ~3x headroom keeps the quoted counts honest as the product gets better at
// its job, rather than shrinking them later.
//
// Re-measure once ~100 real conversations exist against a populated brain; the
// direction of error is predictable, since cost rises as quality does.
export const CREDITS_PER_CONVERSATION = 2;

/** Credits → the conversation count shown to customers. */
export function conversationsFromCredits(credits: number): number {
  return Math.round(credits / CREDITS_PER_CONVERSATION);
}
export type PlanId = keyof typeof PLANS;

export function isPlanId(v: string): v is PlanId {
  return v in PLANS;
}

/**
 * Master switch for the STRIPE code path only — checkout, the billing portal,
 * and the Stripe webhook (see billingConfigured() in apps/web/lib/stripe.ts).
 *
 * It deliberately does NOT affect credit enforcement. Credits cap real Anthropic
 * spend, so trial expiry and plan allowances apply whether or not Stripe is
 * switched on; customers who run out have a working manual payment path at
 * /checkout. Flip this to true once a registered company + live Stripe keys
 * exist.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
}

export function creditsFromMicrocents(microcents: number): number {
  return Math.ceil(microcents / MICROCENTS_PER_CREDIT);
}

/** Which record granted the current plan. Answers "why do I have this?". */
export type EntitlementSource = "manual" | "provider" | "trial";

export interface CreditStatus {
  /** Set when the workspace is on trial: when it ends / whether it has ended. */
  trialEndsAt: string | null;
  trialEnded: boolean;
  plan: PlanId;
  /** Where `plan` came from — previously unanswerable without reading two tables. */
  source: EntitlementSource;
  /** When the granting record runs out: paidThrough, period end, or trial end. */
  activeUntil: string | null;
  allowance: number;
  used: number;
  remaining: number;
  exhausted: boolean;
  periodStart: Date;
  periodEnd: Date;
  subscriptionStatus: string | null;
}

/**
 * Plan ranking, used to settle disagreements between payment records.
 * Order matters more than the numbers: it is "how much was bought", not a
 * feature list.
 */
const PLAN_RANK: Record<PlanId, number> = { trial: 0, starter: 1, pro: 2 };

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
      return {
        ...parsed,
        periodStart: new Date(parsed.periodStart),
        periodEnd: new Date(parsed.periodEnd),
      };
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

  // ── Entitlement is DERIVED here, never stored ───────────────────────────
  //
  // Two payment paths grant access and each owns its own record:
  //   • manual bank/Whish  → workspaces.plan + paid_through
  //   • provider (Paddle/Stripe) → the subscriptions row
  //
  // They used to share workspaces.plan, which meant one webhook could undo a
  // paying manual customer: a non-active status wrote plan="trial" while
  // paid_through was still in the future, so the customer kept access but
  // silently dropped to the 300-credit trial allowance. Nothing errored.
  //
  // When the two records disagree, the MORE GENEROUS active one wins. Both
  // represent money that actually arrived, and the two errors are not
  // symmetric: over-granting costs a little AI spend, while downgrading
  // someone who paid is a refund conversation. It cannot be gamed either —
  // manual grants require admin confirmation.
  const paidThrough = wsRows[0]?.paidThrough ?? null;
  const manual =
    !!paidThrough && paidThrough.getTime() > Date.now() && isPlanId(wsRows[0]?.wsPlan ?? "")
      ? { plan: wsRows[0]!.wsPlan as PlanId, until: paidThrough }
      : null;

  const providerActive =
    sub && (sub.status === "active" || sub.status === "trialing") && isPlanId(sub.plan)
      ? { plan: sub.plan as PlanId, until: sub.currentPeriodEnd ?? null }
      : null;

  const candidates = [manual, providerActive].filter((c) => c !== null);
  const best = candidates.reduce<{ plan: PlanId; until: Date | null } | null>(
    (acc, c) => (acc === null || PLAN_RANK[c.plan] > PLAN_RANK[acc.plan] ? c : acc),
    null,
  );

  const plan: PlanId = best?.plan ?? "trial";
  const source: EntitlementSource =
    best === null ? "trial" : best === manual ? "manual" : "provider";

  // Usage is measured over the provider's billing period when the provider is
  // what granted the plan; otherwise a calendar month.
  const period =
    source === "provider" && sub?.currentPeriodStart && sub?.currentPeriodEnd
      ? { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
      : calendarPeriod();

  const usage = await db()
    // ::bigint, not ::int — int4 tops out at 2_147_483_647 microcents ($21.47)
    // of spend in a single period, which a Starter workspace reaches just shy of
    // its cap and Premium ($100) blows straight past. Postgres sum() over int4
    // already returns bigint; the old ::int narrowed it back down and threw.
    // Values stay far inside Number.MAX_SAFE_INTEGER ($90bn), so the driver
    // handing this back as a JS number is safe.
    // postgres.js returns int8 as a string, hence sql<string> + Number() below.
    .select({ microcents: sql<string>`coalesce(sum(${aiCalls.estimatedCostMicrocents}), 0)::bigint` })
    .from(aiCalls)
    .where(and(eq(aiCalls.workspaceId, workspaceId), gte(aiCalls.createdAt, period.start)));

  const allowance = PLANS[plan].monthlyCredits;
  const used = creditsFromMicrocents(Number(usage[0]?.microcents ?? 0));

  // Trial workspaces are time-gated (7 days), once.
  //
  // A null trialEndsAt used to be treated as "no expiry, active for safety",
  // which quietly granted a permanent free tier: the trial credit allowance
  // resets every calendar period, so such a workspace renewed forever. Null now
  // means EXPIRED — a workspace on the trial plan with no end date has no
  // entitlement to prove, and the manual checkout path is one click away. That
  // is the safe direction to fail for something that gives away real AI spend.
  const trialEndsAt = plan === "trial" ? (wsRows[0]?.trialEndsAt ?? null) : null;
  const trialEnded = plan === "trial" && (!trialEndsAt || trialEndsAt.getTime() < Date.now());
  const status: CreditStatus = {
    plan,
    source,
    activeUntil: (best?.until ?? trialEndsAt)?.toISOString() ?? null,
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
  return status;
}

export async function invalidateCreditCache(workspaceId: string) {
  await redis().del(`credits:${workspaceId}`).catch(() => {});
}

/**
 * Upsert from a payment provider webhook — the only writer of subscription
 * state. Provider-neutral by signature: Stripe and Paddle both call this with
 * their own ids, and `provider` says which system those ids belong to.
 */
export async function applySubscriptionState(args: {
  workspaceId: string;
  provider: "stripe" | "paddle";
  providerCustomerId: string;
  providerSubscriptionId: string | null;
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
        provider: args.provider,
        providerCustomerId: args.providerCustomerId,
        providerSubscriptionId: args.providerSubscriptionId,
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
      provider: args.provider,
      providerCustomerId: args.providerCustomerId,
      providerSubscriptionId: args.providerSubscriptionId,
      plan: args.plan,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
    });
  }
  // This function deliberately does NOT touch `workspaces`.
  //
  // It used to write workspaces.plan, which the manual bank/Whish path also
  // owns (packages/core/src/payments.ts writes plan + paid_through). Two
  // writers on one field meant a single webhook could silently undo a paying
  // manual customer — a non-active status wrote plan="trial" while paid_through
  // was still in the future, so they kept access at the 300-credit trial
  // allowance after paying for Starter.
  //
  // Each path now owns its own record and getCreditStatus() derives the
  // effective plan from both. A lapsed subscription needs no write here: it
  // simply stops counting as an active entitlement, and an expired trial does
  // not revive.
  await invalidateCreditCache(args.workspaceId);
}
