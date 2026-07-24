import { metaAccessToken, subscribeInstagramWebhooks } from "@platform/channels";
import { channels, connections, db } from "@platform/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

/**
 * Retry the Instagram webhook subscription for an existing connection ("Finish
 * setup"). Idempotent: subscribing an already-subscribed account is a no-op at
 * Meta. On success we flip every attached channel's config.webhookSubscribed so
 * the UI reflects that the account is now actually receiving DMs.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const conn = await db()
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!conn[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conn[0].provider !== "instagram") {
    return NextResponse.json({ error: "Not an Instagram connection" }, { status: 400 });
  }
  if (conn[0].status !== "active") {
    return NextResponse.json(
      { error: "This connection needs to be reconnected first." },
      { status: 409 },
    );
  }

  try {
    const token = await metaAccessToken(conn[0].nangoConnectionId, "instagram");
    await subscribeInstagramWebhooks(token);
  } catch {
    return NextResponse.json(
      { error: "Couldn't subscribe to Instagram messages — try reconnecting the account." },
      { status: 502 },
    );
  }

  const attached = await db().select().from(channels).where(eq(channels.connectionId, id));
  for (const ch of attached) {
    await db()
      .update(channels)
      .set({ config: { ...ch.config, webhookSubscribed: true } })
      .where(eq(channels.id, ch.id));
  }

  return NextResponse.json({ ok: true, webhookSubscribed: true });
}
