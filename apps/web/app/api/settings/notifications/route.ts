import { db, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

const patchSchema = z.object({
  draftEmails: z.boolean().optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
});

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const rows = await db()
    .select({ settings: workspaces.notificationSettings })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id))
    .limit(1);
  const s = rows[0]?.settings ?? {};
  // Default: draft emails ON. Recipient defaults to the owner (shown blank).
  return NextResponse.json({ draftEmails: s.draftEmails !== false, email: s.email ?? "" });
}

export async function PATCH(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const current =
    (
      await db()
        .select({ settings: workspaces.notificationSettings })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspace.id))
        .limit(1)
    )[0]?.settings ?? {};
  const next = {
    ...current,
    ...(parsed.data.draftEmails !== undefined ? { draftEmails: parsed.data.draftEmails } : {}),
    ...(parsed.data.email !== undefined ? { email: parsed.data.email || undefined } : {}),
  };
  await db()
    .update(workspaces)
    .set({ notificationSettings: next })
    .where(eq(workspaces.id, ctx.workspace.id));
  return NextResponse.json({ draftEmails: next.draftEmails !== false, email: next.email ?? "" });
}
