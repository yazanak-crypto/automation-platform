/** DB-gated: entitlement is derived from two independent payment records. */
import { beforeAll, describe, expect, it } from "vitest";
import { db, subscriptions, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import { applySubscriptionState, getCreditStatus, invalidateCreditCache, PLANS } from "../src";

const hasDb = !!process.env.TEST_DATABASE_URL;
const uuid = () => crypto.randomUUID();
const future = (days: number) => new Date(Date.now() + days * 86_400_000);
const past = (days: number) => new Date(Date.now() - days * 86_400_000);

describe.skipIf(!hasDb)("entitlement source of truth", () => {
  async function newWorkspace(patch: Partial<typeof workspaces.$inferInsert> = {}) {
    const ws = (
      await db()
        .insert(workspaces)
        .values({ name: "Ent T", slug: `t-${uuid().slice(0, 12)}`, ...patch })
        .returning()
    )[0]!;
    await invalidateCreditCache(ws.id);
    return ws.id;
  }

  const status = async (id: string) => {
    await invalidateCreditCache(id);
    return getCreditStatus(id);
  };

  it("a lapsed subscription CANNOT downgrade a paying manual customer", async () => {
    // The bug this whole change exists for. Manual customer paid for Starter;
    // an unrelated webhook (card expiry, dunning) reports a non-active
    // subscription. Previously that wrote plan="trial" while paid_through was
    // still in the future, leaving them on 300 trial credits after paying.
    const id = await newWorkspace({ plan: "starter", paidThrough: future(20) });
    await applySubscriptionState({
      workspaceId: id,
      provider: "stripe",
      providerCustomerId: "cus_x",
      providerSubscriptionId: "sub_x",
      plan: "starter",
      status: "canceled",
      currentPeriodStart: past(30),
      currentPeriodEnd: past(1),
    });

    const s = await status(id);
    expect(s.plan).toBe("starter");
    expect(s.source).toBe("manual");
    expect(s.allowance).toBe(PLANS.starter.monthlyCredits);
    expect(s.exhausted).toBe(false);

    // And the manual record itself was never touched by the webhook.
    const ws = (await db().select().from(workspaces).where(eq(workspaces.id, id)))[0]!;
    expect(ws.plan).toBe("starter");
    expect(ws.paidThrough).not.toBeNull();
  });

  it("the more generous active record wins when the two disagree", async () => {
    // Manual Starter + active provider Premium: both are money that arrived.
    const id = await newWorkspace({ plan: "starter", paidThrough: future(10) });
    await applySubscriptionState({
      workspaceId: id,
      provider: "paddle",
      providerCustomerId: "ctm_x",
      providerSubscriptionId: "sub_x",
      plan: "pro",
      status: "active",
      currentPeriodStart: past(1),
      currentPeriodEnd: future(29),
    });

    const s = await status(id);
    expect(s.plan).toBe("pro");
    expect(s.source).toBe("provider");
    expect(s.allowance).toBe(PLANS.pro.monthlyCredits);
  });

  it("keeps the manual plan when it is the higher of the two", async () => {
    const id = await newWorkspace({ plan: "pro", paidThrough: future(10) });
    await applySubscriptionState({
      workspaceId: id,
      provider: "paddle",
      providerCustomerId: "ctm_y",
      providerSubscriptionId: "sub_y",
      plan: "starter",
      status: "active",
      currentPeriodStart: past(1),
      currentPeriodEnd: future(29),
    });

    const s = await status(id);
    expect(s.plan).toBe("pro");
    expect(s.source).toBe("manual");
  });

  it("falls back to trial when neither record is active, and stays expired", async () => {
    const id = await newWorkspace({
      plan: "starter",
      paidThrough: past(1), // manual grant ran out
      trialEndsAt: past(30), // trial long gone
    });
    await applySubscriptionState({
      workspaceId: id,
      provider: "paddle",
      providerCustomerId: "ctm_z",
      providerSubscriptionId: "sub_z",
      plan: "starter",
      status: "canceled",
      currentPeriodStart: past(60),
      currentPeriodEnd: past(30),
    });

    const s = await status(id);
    expect(s.plan).toBe("trial");
    expect(s.source).toBe("trial");
    expect(s.trialEnded).toBe(true);
    expect(s.exhausted).toBe(true);
  });

  it("reports why the plan is held, and until when", async () => {
    const until = future(15);
    const id = await newWorkspace({ plan: "starter", paidThrough: until });
    const s = await status(id);
    expect(s.source).toBe("manual");
    expect(s.activeUntil).toBe(until.toISOString());
  });

  it("writes only the subscriptions row, never the workspace", async () => {
    const id = await newWorkspace({ plan: "trial", trialEndsAt: future(3) });
    const before = (await db().select().from(workspaces).where(eq(workspaces.id, id)))[0]!;

    await applySubscriptionState({
      workspaceId: id,
      provider: "paddle",
      providerCustomerId: "ctm_w",
      providerSubscriptionId: "sub_w",
      plan: "pro",
      status: "active",
      currentPeriodStart: past(1),
      currentPeriodEnd: future(29),
    });

    const after = (await db().select().from(workspaces).where(eq(workspaces.id, id)))[0]!;
    expect(after.plan).toBe(before.plan);
    expect(after.trialEndsAt?.getTime()).toBe(before.trialEndsAt?.getTime());

    // The entitlement still changes — it is derived, not stored.
    expect((await status(id)).plan).toBe("pro");
    const sub = (await db().select().from(subscriptions).where(eq(subscriptions.workspaceId, id)))[0]!;
    expect(sub.provider).toBe("paddle");
  });
});
