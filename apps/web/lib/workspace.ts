import { resolveWorkspace } from "@platform/core";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Resolve the authenticated user's workspace (creating user+workspace on first
 * login). Every /api/* route MUST go through this — it is the tenancy gate.
 */
export async function requireWorkspace() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;
  if (!user || !email) return null;
  const { workspace, user: dbUser } = await resolveWorkspace({
    clerkUserId: user.id,
    email,
    name: user.fullName ?? undefined,
  });
  return { workspace, user: dbUser, actor: `user:${dbUser.id}` };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
