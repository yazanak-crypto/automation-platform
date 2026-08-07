/**
 * Regression tests for the onboarding redirect loop (DB-gated; run in CI).
 *
 * Root cause was twofold:
 *  1. resolveWorkspace's create path raced with itself on first login —
 *     concurrent requests each created a workspace for the same user.
 *  2. findWorkspaceByClerkId used limit(1) with NO ORDER BY — so with >1
 *     workspace, the onboarding write went to one workspace and the layout
 *     guard read another. Infinite /onboarding loop.
 *
 * These tests pin both fixes: the advisory-lock create path and the
 * deterministic oldest-membership resolution.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { db, users, workspaceMembers, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import { findWorkspaceByClerkId, resolveWorkspace } from "../src/workspace";

const hasDb = !!process.env.TEST_DATABASE_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasDb)("workspace resolution (onboarding-loop regressions)", () => {
  it("concurrent first logins create exactly ONE workspace (advisory lock)", async () => {
    const clerkId = `user_test_${uuid().slice(0, 12)}`;
    const identity = { clerkUserId: clerkId, email: `${clerkId}@test.example`, name: "Race T" };

    // Simulate the real first-page-load fan-out: layout + page + API routes
    // all resolving at once.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => resolveWorkspace(identity)),
    );

    const workspaceIds = new Set(results.map((r) => r.workspace.id));
    expect(workspaceIds.size).toBe(1);

    const userRow = (await db().select().from(users).where(eq(users.clerkId, clerkId)))[0]!;
    const memberships = await db()
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userRow.id));
    expect(memberships).toHaveLength(1);
  });

  it("resolution is deterministic when historical duplicates exist (oldest wins)", async () => {
    // Manufacture the pre-fix corruption: one user, TWO workspaces.
    const clerkId = `user_dupe_${uuid().slice(0, 12)}`;
    const user = (
      await db()
        .insert(users)
        .values({ clerkId, email: `${clerkId}@test.example` })
        .returning()
    )[0]!;
    const mkWs = async (name: string, createdAt: Date) => {
      const ws = (
        await db().insert(workspaces).values({ name, slug: `t-${uuid().slice(0, 12)}` }).returning()
      )[0]!;
      await db().insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: user.id,
        role: "owner",
        createdAt,
      });
      return ws;
    };
    const older = await mkWs("Older WS", new Date(Date.now() - 60_000));
    await mkWs("Newer WS", new Date());

    // Every resolution — read guard AND write path — must agree, always.
    for (let i = 0; i < 5; i++) {
      const found = await findWorkspaceByClerkId(clerkId);
      expect(found?.workspace.id).toBe(older.id);
    }
  });

  it("repeat login resolves the same workspace it created (read == write identity)", async () => {
    const clerkId = `user_stable_${uuid().slice(0, 12)}`;
    const identity = { clerkUserId: clerkId, email: `${clerkId}@test.example` };
    const first = await resolveWorkspace(identity);
    const second = await resolveWorkspace(identity);
    const fast = await findWorkspaceByClerkId(clerkId);
    expect(second.workspace.id).toBe(first.workspace.id);
    expect(fast?.workspace.id).toBe(first.workspace.id);
  });
});

describe.skipIf(hasDb)("workspace resolution (skipped)", () => {
  it("requires DATABASE_URL", () => expect(true).toBe(true));
});
