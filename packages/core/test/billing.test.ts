import { beforeAll, describe, expect, it } from "vitest";
import { aiCalls, db, workspaces } from "@platform/db";
import {
  applySubscriptionState,
  creditsFromMicrocents,
  getCreditStatus,
  isPlanId,
  MICROCENTS_PER_CREDIT,
  PLANS,
} from "../src/billing";

const hasDb = !!(process.env.DATABASE_URL && process.env.REDIS_URL);
const uuid = () => crypto.randomUUID();

describe("credit math (unit)", () => {
  it("1 credit = $0.01; partial credits round up", () => {
    expect(creditsFromMicrocents(0)).toBe(0);
    expect(creditsFromMicrocents(MICROCENTS_PER_CREDIT)).toBe(1);
    expect(creditsFromMicrocents(MICROCENTS_PER_CREDIT + 1)).toBe(2);
    expect(creditsFromMicrocents(25_000)).toBe(3);
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
      await db().insert(workspaces).values({ name: "Bill T", slug: `t-${uuid().slice(0, 12)}` }).returning()
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
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
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

  it("cancellation drops back to trial", async () => {
    await applySubscriptionState({
      workspaceId: ws,
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
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
