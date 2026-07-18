import { db, workspaces } from "@platform/db";
import { workspaceAutonomySchema } from "@platform/schemas";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

const patchSchema = z.object({ autonomySettings: workspaceAutonomySchema }).strict();

export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  return NextResponse.json({
    id: ctx.workspace.id,
    name: ctx.workspace.name,
    autonomySettings: ctx.workspace.autonomySettings ?? null,
  });
}

/** Workspace-level autonomy settings (Decision 012): the business's risk dial. */
export async function PATCH(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const rows = await db()
    .update(workspaces)
    .set({ autonomySettings: parsed.data.autonomySettings })
    .where(eq(workspaces.id, ctx.workspace.id))
    .returning({ autonomySettings: workspaces.autonomySettings });
  return NextResponse.json(rows[0]);
}
