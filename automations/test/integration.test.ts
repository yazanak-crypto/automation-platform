/** DB-gated: seed idempotency + activation gating (runs in CI). */
import { beforeAll, describe, expect, it } from "vitest";
import { activations, automations, automationVersions, channels, db, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import { seedCatalog } from "../seed";
// dev-only import for the gating helper (core is not a runtime dep of catalog)
import { findActiveActivation } from "@platform/core";

const hasDb = !!process.env.TEST_DATABASE_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("catalog seed + activation gating", () => {
  let ws: string;
  let chA: string;
  let chB: string;
  let versionId: string;

  beforeAll(async () => {
    await seedCatalog();
    await seedCatalog(); // idempotency: second run must not duplicate

    ws = (await db().insert(workspaces).values({ name: "Cat T", slug: `t-${uuid().slice(0, 12)}` }).returning())[0]!.id;
    const mkCh = async () =>
      (
        await db()
          .insert(channels)
          .values({ workspaceId: ws, type: "web_chat", displayName: "wc", config: {} })
          .returning()
      )[0]!.id;
    chA = await mkCh();
    chB = await mkCh();

    const auto = await db().select().from(automations).where(eq(automations.slug, "lead-concierge")).limit(1);
    versionId = auto[0]!.currentVersionId!;
  });

  it("seed is idempotent: one automation row, one version row", async () => {
    const autos = await db().select().from(automations).where(eq(automations.slug, "lead-concierge"));
    expect(autos).toHaveLength(1);
    expect(autos[0]!.status).toBe("live");
    const versions = await db()
      .select()
      .from(automationVersions)
      .where(eq(automationVersions.automationId, autos[0]!.id));
    expect(versions).toHaveLength(1);
  });

  it("gating: only active activations covering the channel match", async () => {
    // none yet
    expect(await findActiveActivation(ws, "lead-concierge", chA)).toBeNull();

    const act = (
      await db()
        .insert(activations)
        .values({
          workspaceId: ws,
          automationVersionId: versionId,
          automationSlug: "lead-concierge",
          channelIds: [chA],
        })
        .returning()
    )[0]!;

    expect((await findActiveActivation(ws, "lead-concierge", chA))?.id).toBe(act.id);
    // different channel → no match
    expect(await findActiveActivation(ws, "lead-concierge", chB)).toBeNull();
    // different workspace → no match
    expect(await findActiveActivation(uuid(), "lead-concierge", chA)).toBeNull();

    // paused → no match (no AI, no cost)
    await db().update(activations).set({ status: "paused" }).where(eq(activations.id, act.id));
    expect(await findActiveActivation(ws, "lead-concierge", chA)).toBeNull();

    // resumed → matches again
    await db().update(activations).set({ status: "active" }).where(eq(activations.id, act.id));
    expect((await findActiveActivation(ws, "lead-concierge", chA))?.id).toBe(act.id);
  });
});

describe.skipIf(hasDb)("catalog integration (skipped)", () => {
  it("requires DATABASE_URL", () => expect(true).toBe(true));
});
