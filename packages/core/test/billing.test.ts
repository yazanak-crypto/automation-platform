import { beforeAll, describe, expect, it } from "vitest";
import { aiCalls, db, subscriptions as subscriptionsTable, workspaces } from "@platform/db";
import { eq as eqOp } from "drizzle-orm";
import {
  applySubscriptionState,
  conversationsFromCredits,
  CREDITS_PER_CONVERSATION,
  creditsFromMicrocents,
  getCreditStatus,
  isPlanId,
  MICROCENTS_PER_CREDIT,
  PLANS,
} from "../src/billing";

const hasDb = !!(process.env.TEST_DATABASE_URL && process.env.REDIS_URL);
const uuid = () => crypto.randomUUID();

// Independent of billing.ts on purpose: a microcent is 1e-8 USD, so a dollar is
// 1e8 microcents. Every assertion below is written in dollars and converted with
// THIS constant, never with MICROCENTS_PER_CREDIT — otherwise the test cancels
// the constant out on both sides and passes at any scale, which is exactly how
// a credit sat at $0.0001 while this file claimed $0.01.
const MICROCENTS_PER_USD = 100_000_000;
const usd = (dollars: number) => Math.round(dollars * MICROCENTS_PER_USD);

describe("credit math (unit)", () => {
  it("1 credit = $0.01 of AI spend", () => {
    expect(MICROCENTS_PER_CREDIT).toBe(usd(0.01));
    expect(creditsFromMicrocents(usd(0.01))).toBe(1);
    expect(creditsFromMicrocents(usd(1))).toBe(100);
    expect(creditsFromMicrocents(usd(20))).toBe(2_000);
  });

  it("prices a real Haiku call at its list cost", () => {
    // Haiku 4.5 input is $1/MTok (packages/ai/src/pricing.ts: 100 microcents per
    // token), so a million input tokens is $1.00 = 100 credits. Hardcoded rather
    // than imported: @platform/ai is not a dependency of core, and pinning the
    // number here makes a pricing-table edit show up as a billing failure.
    expect(creditsFromMicrocents(1_000_000 * 100)).toBe(100);
  });

  it("partial credits round up", () => {
    expect(creditsFromMicrocents(0)).toBe(0);
    expect(creditsFromMicrocents(1)).toBe(1);
    expect(creditsFromMicrocents(usd(0.01) + 1)).toBe(2);
    expect(creditsFromMicrocents(usd(0.025))).toBe(3);
  });

  it("plan allowances map to their intended dollar ceilings", () => {
    // These ARE the worst-case Anthropic bill per workspace per period, so they
    // are written in dollars. Against monthly revenue that is a COGS ceiling of
    // ~15% on Entry ($6 / $39), ~20% on Starter ($20 / $99), ~24% on Growth
    // ($60 / $249) and ~32% on Premium ($160 / $499) — worst case, i.e. a
    // workspace that uses every conversation it paid for.
    expect(PLANS.entry.monthlyCredits * MICROCENTS_PER_CREDIT).toBe(usd(6));
    expect(PLANS.starter.monthlyCredits * MICROCENTS_PER_CREDIT).toBe(usd(20));
    expect(PLANS.growth.monthlyCredits * MICROCENTS_PER_CREDIT).toBe(usd(60));
    expect(PLANS.pro.monthlyCredits * MICROCENTS_PER_CREDIT).toBe(usd(160));
    expect(PLANS.trial.monthlyCredits * MICROCENTS_PER_CREDIT).toBe(usd(1.5));
  });

  it("quotes conversation counts from the measured cost per conversation", () => {
    // 4 = corrected v5 mean ($0.01336/run) x 2 runs x 1.25 headroom, rounded
    // up. Pinned so the next change to either number is deliberate — and so a
    // change to CREDITS_PER_CONVERSATION alone, without restating every plan's
    // monthlyCredits, fails here instead of silently re-advertising every tier.
    expect(CREDITS_PER_CONVERSATION).toBe(4);
    expect(conversationsFromCredits(PLANS.entry.monthlyCredits)).toBe(150);
    expect(conversationsFromCredits(PLANS.starter.monthlyCredits)).toBe(500);
    expect(conversationsFromCredits(PLANS.growth.monthlyCredits)).toBe(1_500);
    expect(conversationsFromCredits(PLANS.pro.monthlyCredits)).toBe(4_000);
    // The trial holds its $1.50 spend ceiling across the repricing, so its
    // derived count moved 75 -> 38 rather than its cost moving.
    expect(conversationsFromCredits(PLANS.trial.monthlyCredits)).toBe(38);
  });

  it("derives the constant from the measured inputs, not a hardcoded number", () => {
    // Regression guard for the merge that shipped TWO CREDITS_PER_CONVERSATION
    // declarations (a hardcoded 4 and the computed form) and, underneath that,
    // a computed form reading 1,997,667 microcents/run — the figure produced
    // while Sonnet 5 was billed at $3/$15 instead of $2/$10, which yields 5.
    //
    // Written as the arithmetic rather than a literal so that re-measuring the
    // inputs updates the expectation with them, while a rate-inflated input
    // still fails: at 1,997,667 this comes out 5 and the assertion above breaks.
    const MEASURED_MICROCENTS_PER_RUN = 1_335_167;
    const RUNS_PER_CONVERSATION = 2;
    const HEADROOM = 1.25;
    expect(CREDITS_PER_CONVERSATION).toBe(
      Math.ceil(
        (MEASURED_MICROCENTS_PER_RUN * RUNS_PER_CONVERSATION * HEADROOM) / MICROCENTS_PER_CREDIT,
      ),
    );
  });

  it("plan ids validate", () => {
    expect(isPlanId("starter")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
    expect(PLANS.trial.monthlyCredits).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDb)("credit status + subscription state (DB)", () => {
  let ws: string;

  beforeAll(async () => {
    ws = (
      await db()
        .insert(workspaces)
        .values({
          name: "Bill T",
          slug: `t-${uuid().slice(0, 12)}`,
          // A real workspace always gets a trial end date at creation. This
          // test used to omit it and rely on null meaning "never expires",
          // which was the permanent-free-tier bug — null now means expired.
          trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
        })
        .returning()
    )[0]!.id;
  });

  async function burn(microcents: number) {
    await db().insert(aiCalls).values({
      workspaceId: ws,
      model: "m",
      promptRef: "p",
      promptVersion: "v",
      tokensIn: 1,
      tokensOut: 1,
      estimatedCostMicrocents: microcents,
      latencyMs: 1,
      success: true,
    });
  }

  it("defaults to trial with calendar-month period; consumption from ai_calls", async () => {
    const before = await getCreditStatus(ws, { skipCache: true });
    expect(before.plan).toBe("trial");
    expect(before.used).toBe(0);
    expect(before.exhausted).toBe(false);

    await burn(3 * MICROCENTS_PER_CREDIT);
    const after = await getCreditStatus(ws, { skipCache: true });
    expect(after.used).toBe(3);
    expect(after.remaining).toBe(PLANS.trial.monthlyCredits - 3);
  });

  it("exhaustion flips when usage crosses the allowance", async () => {
    await burn(PLANS.trial.monthlyCredits * MICROCENTS_PER_CREDIT);
    const s = await getCreditStatus(ws, { skipCache: true });
    expect(s.exhausted).toBe(true);
    expect(s.remaining).toBe(0);
  });

  it("an active Stripe subscription upgrades the allowance and anchors the period", async () => {
    const start = new Date(Date.now() - 24 * 3600 * 1000);
    const end = new Date(Date.now() + 29 * 24 * 3600 * 1000);
    await applySubscriptionState({
      workspaceId: ws,
      provider: "stripe" as const,
      providerCustomerId: "cus_test",
      providerSubscriptionId: "sub_test",
      plan: "pro",
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    });
    const s = await getCreditStatus(ws, { skipCache: true });
    expect(s.plan).toBe("pro");
    expect(s.allowance).toBe(PLANS.pro.monthlyCredits);
    expect(s.exhausted).toBe(false); // pro allowance absorbs the trial burn
    expect(s.periodEnd.getTime()).toBe(end.getTime());
  });

  it("7-day trial: past trialEndsAt blocks AI even with credits left", async () => {
    const ws2 = (
      await db().insert(workspaces).values({ name: "Trial T", slug: `t-${uuid().slice(0, 12)}`, trialEndsAt: new Date(Date.now() - 3600_000) }).returning()
    )[0]!.id;
    const s = await getCreditStatus(ws2, { skipCache: true });
    expect(s.trialEnded).toBe(true);
    expect(s.exhausted).toBe(true);

    const ws3 = (
      await db().insert(workspaces).values({ name: "Trial A", slug: `t-${uuid().slice(0, 12)}`, trialEndsAt: new Date(Date.now() + 86400_000) }).returning()
    )[0]!.id;
    const s3 = await getCreditStatus(ws3, { skipCache: true });
    expect(s3.trialEnded).toBe(false);
    expect(s3.exhausted).toBe(false);
  });

  it("cancellation drops back to trial", async () => {
    await applySubscriptionState({
      workspaceId: ws,
      provider: "stripe" as const,
      providerCustomerId: "cus_test",
      providerSubscriptionId: "sub_test",
      plan: "trial",
      status: "canceled",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    const s = await getCreditStatus(ws, { skipCache: true });
    expect(s.plan).toBe("trial");
  });
});

describe.skipIf(hasDb)("billing (skipped)", () => {
  it("requires DATABASE_URL + REDIS_URL", () => expect(true).toBe(true));
});

describe.skipIf(!hasDb)("trial expiry (DB)", () => {
  it("treats a NULL trial end date as expired, not as unlimited", async () => {
    // The old rule was "null = no expiry, active for safety", which granted a
    // permanent free tier: the trial allowance resets every calendar period, so
    // such a workspace renewed forever. Failing closed is the safe direction
    // for something that spends real AI budget.
    const id = (
      await db()
        .insert(workspaces)
        .values({ name: "Null trial", slug: `t-${uuid().slice(0, 12)}` })
        .returning()
    )[0]!.id;

    const s = await getCreditStatus(id, { skipCache: true });
    expect(s.plan).toBe("trial");
    expect(s.trialEnded).toBe(true);
    expect(s.exhausted).toBe(true);
  });
});

describe.skipIf(!hasDb)("applySubscriptionState concurrency (DB)", () => {
  it("survives two events for the same workspace arriving at once", async () => {
    // The real failure: replaying subscription.created and subscription.trialing
    // 0.4s apart made both reads see no row, both insert, and the loser die on
    // subscriptions_workspace_id_unique with a 500. Paddle fans out several
    // events per checkout, so concurrent delivery is normal — and a 500 there is
    // a customer who paid and did not get access.
    const ws = (
      await db()
        .insert(workspaces)
        .values({ name: "Race T", slug: `t-${uuid().slice(0, 12)}`, trialEndsAt: new Date(Date.now() + 7 * 86_400_000) })
        .returning()
    )[0]!.id;

    const event = (status: string) => ({
      workspaceId: ws,
      provider: "paddle" as const,
      providerCustomerId: "ctm_race",
      providerSubscriptionId: "sub_race",
      plan: "starter" as const,
      status,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    await expect(
      Promise.all([
        applySubscriptionState(event("trialing")),
        applySubscriptionState(event("trialing")),
        applySubscriptionState(event("trialing")),
      ]),
    ).resolves.toBeDefined();

    const s = await getCreditStatus(ws, { skipCache: true });
    expect(s.plan).toBe("starter");
  });

  it("a later event overwrites an earlier one rather than duplicating the row", async () => {
    const ws = (
      await db()
        .insert(workspaces)
        .values({ name: "Race U", slug: `t-${uuid().slice(0, 12)}`, trialEndsAt: new Date(Date.now() + 7 * 86_400_000) })
        .returning()
    )[0]!.id;
    const base = {
      workspaceId: ws,
      provider: "paddle" as const,
      providerCustomerId: "ctm_u",
      providerSubscriptionId: "sub_u",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
    await applySubscriptionState({ ...base, plan: "starter", status: "trialing" });
    await applySubscriptionState({ ...base, plan: "pro", status: "active" });

    const rows = await db()
      .select({ id: subscriptionsTable.id, plan: subscriptionsTable.plan, status: subscriptionsTable.status })
      .from(subscriptionsTable)
      .where(eqOp(subscriptionsTable.workspaceId, ws));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plan: "pro", status: "active" });
  });
});
