import { igProfile, metaAccessToken, subscribeInstagramWebhooks } from "@platform/channels";
import { channels, connections, db } from "@platform/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

const bodySchema = z.object({ nangoConnectionId: z.string().min(8).max(200) });

/**
 * Finalize an Instagram connection after the client-side Nango OAuth flow.
 * We verify the connection actually works (token + profile fetch) before
 * storing anything. The IG business account id is persisted so inbound
 * webhooks can be routed back to this workspace's channel.
 */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // The nangoConnectionId is minted by us client-side as `ws-<workspaceId>-...`;
  // enforce the prefix so one workspace can't claim another's connection.
  if (!parsed.data.nangoConnectionId.startsWith(`ws-${ctx.workspace.id}`)) {
    return NextResponse.json({ error: "Invalid connection" }, { status: 403 });
  }

  let profile: { id: string; username: string };
  let token: string;
  try {
    token = await metaAccessToken(parsed.data.nangoConnectionId, "instagram");
    profile = await igProfile(token);
  } catch {
    return NextResponse.json(
      { error: "Instagram connection didn't complete — try connecting again." },
      { status: 502 },
    );
  }

  // Subscribe the account to our webhooks — without this Meta delivers no DMs.
  // A failure here doesn't lose the connection: we store it un-subscribed and
  // the UI offers a one-click retry ("Finish setup"), so nothing is faked.
  let webhookSubscribed = false;
  try {
    await subscribeInstagramWebhooks(token);
    webhookSubscribed = true;
  } catch {
    webhookSubscribed = false;
  }

  const connection = (
    await db()
      .insert(connections)
      .values({
        workspaceId: ctx.workspace.id,
        provider: "instagram",
        nangoConnectionId: parsed.data.nangoConnectionId,
        providerAccountId: profile.id,
        externalAccountLabel: `@${profile.username}`,
      })
      .onConflictDoNothing()
      .returning()
  )[0];
  if (!connection) {
    return NextResponse.json({ error: "Connection already registered" }, { status: 409 });
  }

  const channel = (
    await db()
      .insert(channels)
      .values({
        workspaceId: ctx.workspace.id,
        type: "instagram",
        connectionId: connection.id,
        displayName: `Instagram · @${profile.username}`,
        config: { webhookSubscribed },
        capabilities: { supportsRichText: false },
      })
      .returning()
  )[0];

  return NextResponse.json(
    {
      connection,
      channel,
      warning: webhookSubscribed
        ? undefined
        : "Connected, but we couldn't subscribe to Instagram messages yet. Use “Finish setup” to retry.",
    },
    { status: 201 },
  );
}
