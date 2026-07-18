/** DB-gated: graduation stats from the run ledger + autonomy telemetry columns. */
import { beforeAll, describe, expect, it } from "vitest";
import { db, runs, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import { computeGraduation, createRun, finishRun } from "../src";

const hasDb = !!process.env.DATABASE_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("graduation + run telemetry", () => {
  let ws: string;
  const activationId = uuid();
  const activatedAt = new Date(Date.now() - 10 * 24 * 3600 * 1000); // 10 days ago

  beforeAll(async () => {
    ws = (
      await db().insert(workspaces).values({ name: "Grad T", slug: `t-${uuid().slice(0, 12)}` }).returning()
    )[0]!.id;
  });

  async function seedRun(resolution: string, wouldAutoSend = false) {
    const run = await createRun({ workspaceId: ws, kind: "lead-concierge", activationId });
    await finishRun(run.id, "succeeded", {
      outcomeMetrics: { resolution, wouldAutoSend },
      category: "faq",
      confidence: 0.9,
      action: "draft_for_approval",
    });
    return run;
  }

  it("finishRun persists autonomy telemetry columns", async () => {
    const run = await seedRun("approved", true);
    const row = (await db().select().from(runs).where(eq(runs.id, run.id)))[0]!;
    expect(row.category).toBe("faq");
    expect(row.confidence).toBeCloseTo(0.9);
    expect(row.action).toBe("draft_for_approval");
  });

  it("computes stats and eligibility from the ledger", async () => {
    // 11 more approvals (12 total incl. previous test), 1 edited → rate 11/12 ≈ 0.92
    for (let i = 0; i < 10; i++) await seedRun("approved", i % 2 === 0);
    await seedRun("approved_edited", false);

    const g = await computeGraduation(ws, activationId, activatedAt);
    expect(g.approvals).toBe(12);
    expect(g.approvedUnedited).toBe(11);
    expect(g.uneditedRate).toBeGreaterThanOrEqual(0.9);
    expect(g.wouldHaveAutoHandled).toBeGreaterThan(0);
    expect(g.eligible).toBe(true);
  });

  it("not eligible when too recent", async () => {
    const g = await computeGraduation(ws, activationId, new Date());
    expect(g.eligible).toBe(false); // < minDaysActive
  });

  it("streak breaks on an edited approval", async () => {
    await seedRun("approved");
    // wait-free: seedRun with edited at the top of the ledger
    await seedRun("approved_edited", false);
    const g = await computeGraduation(ws, activationId, activatedAt);
    expect(g.currentUneditedStreak).toBe(0);
  });
});

describe.skipIf(hasDb)("graduation (skipped)", () => {
  it("requires DATABASE_URL", () => expect(true).toBe(true));
});
