import { getBrain } from "@platform/brain";
import { channels, connections, conversations, db, messages } from "@platform/db";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/**
 * Export the workspace's own data as JSON. Read-only; never includes secrets
 * (OAuth tokens live in the Nango vault, not our DB — we only store labels).
 */
export async function GET() {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const wsId = ctx.workspace.id;

  const [brain, chans, conns, convoCount, msgCount] = await Promise.all([
    getBrain(wsId).catch(() => null),
    db().select({ id: channels.id, type: channels.type, displayName: channels.displayName, status: channels.status }).from(channels).where(eq(channels.workspaceId, wsId)),
    db().select({ id: connections.id, provider: connections.provider, label: connections.externalAccountLabel, status: connections.status }).from(connections).where(eq(connections.workspaceId, wsId)),
    db().select({ n: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.workspaceId, wsId)),
    db().select({ n: sql<number>`count(*)::int` }).from(messages).where(eq(messages.workspaceId, wsId)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name, plan: ctx.workspace.plan },
    businessBrain: brain,
    channels: chans,
    connections: conns, // labels only — no credentials
    counts: { conversations: convoCount[0]?.n ?? 0, messages: msgCount[0]?.n ?? 0 },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ovanth-export-${wsId}.json"`,
    },
  });
}
