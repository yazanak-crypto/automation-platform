/**
 * Integration tests — require a real Postgres with migrations applied:
 *   DATABASE_URL=postgres://platform:platform@localhost:5432/platform pnpm test
 * Skipped automatically when DATABASE_URL is not set (e.g. dev machine
 * without Docker). CI runs them against a service container.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { brainChangeLog, db, workspaces } from "@platform/db";
import { desc, eq } from "drizzle-orm";
import {
  createBoundary,
  createKnowledge,
  deleteBoundary,
  ensureProfile,
  getBrain,
  getContextPack,
  patchBoundary,
  patchKnowledge,
  patchProfile,
} from "../src";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("brain integration", () => {
  let wsA: string;
  let wsB: string;
  const actor = "user:test";

  beforeAll(async () => {
    const mk = async (name: string) =>
      (
        await db()
          .insert(workspaces)
          .values({ name, slug: `t-${crypto.randomUUID().slice(0, 12)}` })
          .returning()
      )[0]!.id;
    wsA = await mk("Tenant A");
    wsB = await mk("Tenant B");
    await ensureProfile(wsA);
    await ensureProfile(wsB);
  });

  async function version(ws: string) {
    return (await ensureProfile(ws)).brainVersion;
  }

  it("bumps brain_version on every mutation path and logs each change", async () => {
    const v0 = await version(wsA);

    await patchProfile(wsA, { identity: { businessName: "Acme" } }, actor);
    const b = await createBoundary(wsA, { ruleText: "Never offer discounts", category: "never_offer", active: true }, actor);
    await patchBoundary(wsA, b.id, { active: false }, actor);
    const k = await createKnowledge(wsA, { kind: "faq", title: "Q?", content: "A." }, actor);
    await patchKnowledge(wsA, k.id, { content: "Better answer." }, actor);
    await deleteBoundary(wsA, b.id, actor);

    const v1 = await version(wsA);
    expect(v1).toBe(v0 + 6);

    const log = await db()
      .select()
      .from(brainChangeLog)
      .where(eq(brainChangeLog.workspaceId, wsA))
      .orderBy(desc(brainChangeLog.version))
      .limit(6);
    expect(log).toHaveLength(6);
    expect(new Set(log.map((l) => l.version)).size).toBe(6); // strictly monotonic
    expect(log[0]!.changeKind).toBe("delete");
  });

  it("confirmation flow: suggested never enters context pack until user confirms", async () => {
    // Simulate what ingest produces: a suggested item.
    const suggested = (
      await db()
        .insert((await import("@platform/db")).knowledgeItems)
        .values({
          workspaceId: wsA,
          kind: "faq",
          title: "Do you ship to Canada?",
          content: "Yes, 5-7 days.",
          provenance: "ai_inferred",
          status: "suggested",
        })
        .returning()
    )[0]!;

    const before = await getContextPack(wsA, ["faq_retrieval"]);
    expect(before.pack.knowledge?.some((i) => i.title.includes("Canada"))).toBe(false);

    const res = await patchKnowledge(wsA, suggested.id, { status: "confirmed" }, actor);
    expect(res?.item.status).toBe("confirmed");

    const after = await getContextPack(wsA, ["faq_retrieval"]);
    expect(after.pack.knowledge?.some((i) => i.title.includes("Canada"))).toBe(true);
    expect(after.brainVersion).toBeGreaterThan(before.brainVersion);
  });

  it("context pack includes only active boundaries and reports the current version", async () => {
    await createBoundary(wsA, { ruleText: "Always hand off legal questions", category: "handoff", active: true }, actor);
    const off = await createBoundary(wsA, { ruleText: "Inactive rule", category: "other", active: false }, actor);
    const { pack, brainVersion } = await getContextPack(wsA, ["boundaries", "identity"]);
    expect(pack.boundaries).toContain("Always hand off legal questions");
    expect(pack.boundaries).not.toContain("Inactive rule");
    expect(brainVersion).toBe(await version(wsA));
    await deleteBoundary(wsA, off.id, actor);
  });

  it("tenant isolation: workspace B cannot read or mutate workspace A entities", async () => {
    const kA = await createKnowledge(wsA, { kind: "faq", title: "A-only", content: "secret" }, actor);
    const bA = await createBoundary(wsA, { ruleText: "A-only rule", category: "other", active: true }, actor);

    // B's reads never contain A's data
    const brainB = await getBrain(wsB);
    expect(brainB.knowledge.some((k) => k.title === "A-only")).toBe(false);
    expect(brainB.boundaries.some((b2) => b2.ruleText === "A-only rule")).toBe(false);

    // B's mutations against A's ids are no-ops
    expect(await patchKnowledge(wsB, kA.id, { status: "confirmed" }, "user:evil")).toBeNull();
    expect(await patchBoundary(wsB, bA.id, { active: false }, "user:evil")).toBeNull();
    expect(await deleteBoundary(wsB, bA.id, "user:evil")).toBe(false);

    // and A's data is untouched
    const brainA = await getBrain(wsA);
    expect(brainA.knowledge.find((k) => k.id === kA.id)?.status).toBe("confirmed");
    expect(brainA.boundaries.find((b2) => b2.id === bA.id)?.active).toBe(true);
  });

  it("B's version is not bumped by failed cross-tenant attempts", async () => {
    const vB = await version(wsB);
    const kA = await createKnowledge(wsA, { kind: "faq", title: "x", content: "y" }, actor);
    await patchKnowledge(wsB, kA.id, { status: "rejected" }, "user:evil");
    expect(await version(wsB)).toBe(vB);
  });
});

describe.skipIf(hasDb)("brain integration (skipped)", () => {
  it("requires DATABASE_URL — run against docker-compose or CI service", () => {
    expect(true).toBe(true);
  });
});
