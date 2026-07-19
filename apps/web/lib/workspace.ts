import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { findWorkspaceByClerkId, resolveWorkspace } from "@platform/core";
import { NextResponse } from "next/server";

/**
 * Resolve the authenticated user's workspace. Perf-critical: runs in the app
 * layout AND every page/route.
 *
 * - `cache()` dedupes it to ONE execution per request — layout + page share
 *   the result instead of re-querying (was the cause of doubled work).
 * - Fast path uses `auth()` (networkless — reads the session JWT) + a single
 *   workspace join. `currentUser()` (a Clerk API round-trip) fires ONLY on
 *   first login, when we actually need email/name to create the workspace.
 */
export const requireWorkspace = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  // Existing user: one DB join, zero Clerk API calls.
  const fast = await findWorkspaceByClerkId(userId);
  if (fast) {
    return { workspace: fast.workspace, user: fast.user, actor: `user:${fast.user.id}` };
  }

  // First login only: fetch the full Clerk profile to seed the new workspace.
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;
  if (!user || !email) return null;
  const { workspace, user: dbUser } = await resolveWorkspace({
    clerkUserId: user.id,
    email,
    name: user.fullName ?? undefined,
  });
  return { workspace, user: dbUser, actor: `user:${dbUser.id}` };
});

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
