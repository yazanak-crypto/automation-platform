import { patchProfile } from "@platform/brain";
import { profilePatchSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function PATCH(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = profilePatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await patchProfile(ctx.workspace.id, parsed.data, ctx.actor);
  // TEMP DIAGNOSTIC (onboarding loop): pair with [onboarding-guard] to prove
  // whether the guard reads the same workspace this wrote to. Remove once the
  // loop is root-caused.
  console.log("[onboarding-write]", {
    clerkUserId: ctx.user.clerkId,
    workspaceId: ctx.workspace.id,
    statusRequested: parsed.data.onboardingStatus ?? "(unchanged)",
    statusPersisted: result.profile.onboardingStatus,
  });
  return NextResponse.json(result);
}
