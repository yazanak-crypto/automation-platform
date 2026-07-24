import { brainChangeLog, db } from "@platform/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/** Read-only audit trail of important changes, from the Business Brain ledger. */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const rows = await db()
    .select({
      id: brainChangeLog.id,
      version: brainChangeLog.version,
      entity: brainChangeLog.entity,
      changeKind: brainChangeLog.changeKind,
      actor: brainChangeLog.actor,
      createdAt: brainChangeLog.createdAt,
    })
    .from(brainChangeLog)
    .where(eq(brainChangeLog.workspaceId, ctx.workspace.id))
    .orderBy(desc(brainChangeLog.createdAt))
    .limit(100);
  return NextResponse.json(rows);
}
