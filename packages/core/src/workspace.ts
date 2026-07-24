import { db, users, workspaceInvites, workspaceMembers, workspaces } from "@platform/db";
import { and, eq, gt } from "drizzle-orm";

// Workspace bootstrap + resolution (AC-1.2). Framework-agnostic: the web app
// passes the authenticated Clerk identity; this must never be called with
// unverified input.

export interface AuthedIdentity {
  clerkUserId: string;
  email: string;
  name?: string;
}

/**
 * Fast path (perf): resolve an EXISTING workspace by Clerk id in one join,
 * with no Clerk API round-trip. Returns null on first login (no row yet),
 * where the caller falls back to the create path that needs email/name.
 */
export async function findWorkspaceByClerkId(clerkUserId: string) {
  const found = await db()
    .select({ user: users, workspace: workspaces })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);
  return found[0] ?? null;
}

export async function resolveWorkspace(identity: AuthedIdentity) {
  const found = await findWorkspaceByClerkId(identity.clerkUserId);
  if (found) return found;

  // First login: create the user, then either JOIN a workspace they were
  // invited to (Users & Permissions) or create a fresh personal workspace.
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

    // Pending, non-expired invite for this email → join that team instead.
    const invite = (
      await tx
        .select()
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.email, identity.email.toLowerCase()),
            eq(workspaceInvites.status, "pending"),
            gt(workspaceInvites.expiresAt, new Date()),
          ),
        )
        .limit(1)
    )[0];
    if (invite) {
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role })
        .onConflictDoNothing();
      await tx
        .update(workspaceInvites)
        .set({ status: "accepted" })
        .where(eq(workspaceInvites.id, invite.id));
      const ws = (
        await tx.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1)
      )[0]!;
      return { user, workspace: ws };
    }

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
