import { deleteNangoConnection } from "@platform/channels";
import { channels, connections, db } from "@platform/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/** Status of one connection + its channel(s). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const conn = await db()
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!conn[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const chans = await db().select().from(channels).where(eq(channels.connectionId, id));
  return NextResponse.json({ connection: conn[0], channels: chans });
}

/**
 * Disconnect: revoke the credentials held by Nango, then mark our records
 * inactive. We do NOT hard-delete — conversation history stays intact and the
 * ledger stays truthful (AC honesty). Reconnecting mints a fresh connection.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const conn = await db()
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!conn[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort credential revocation at the vault. Currently only the Meta
  // providers route through here; extend the map as providers are added.
  if (conn[0].provider === "instagram") {
    try {
      await deleteNangoConnection(conn[0].nangoConnectionId, "instagram");
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Disconnect failed at the OAuth vault" },
        { status: 502 },
      );
    }
  }

  await db().update(connections).set({ status: "revoked" }).where(eq(connections.id, id));
  await db().update(channels).set({ status: "disabled" }).where(eq(channels.connectionId, id));

  return NextResponse.json({ ok: true });
}
