import { db, users, workspaceMembers, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";

// Workspace bootstrap + resolution (AC-1.2). Framework-agnostic: the web app
// passes the authenticated Clerk identity; this must never be called with
// unverified input.

export interface AuthedIdentity {
  clerkUserId: string;
  email: string;
  name?: string;
}

export async function resolveWorkspace(identity: AuthedIdentity) {
  const found = await db()
    .select({ user: users, workspace: workspaces })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(users.clerkId, identity.clerkUserId))
    .limit(1);
  if (found[0]) return found[0];

  // First login: create user + personal workspace + owner membership.
  return db().transaction(async (tx) => {
    const existingUser = await tx
      .select()
      .from(users)
      .where(eq(users.clerkId, identity.clerkUserId))
      .limit(1);
    const user =
      existingUser[0] ??
      (
        await tx
          .insert(users)
          .values({
            clerkId: identity.clerkUserId,
            email: identity.email,
            name: identity.name,
          })
          .onConflictDoNothing()
          .returning()
      )[0];
    if (!user) throw new Error("Failed to create user");

    const slug = `ws-${crypto.randomUUID().slice(0, 8)}`;
    const workspace = (
      await tx
        .insert(workspaces)
        .values({
          name: identity.name ? `${identity.name}'s workspace` : "My workspace",
          slug,
          // 7-day free trial (founder decision) — time-gated, not credit-gated.
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()
    )[0]!;

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
    });

    return { user, workspace };
  });
}
