import { gmailProfile, nangoAccessToken } from "@platform/channels";
import { channels, connections, db } from "@platform/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

const bodySchema = z.object({ nangoConnectionId: z.string().min(8).max(200) });

/**
 * Finalize a Gmail connection after the client-side Nango OAuth flow.
 * We verify the connection actually works (token + profile fetch) before
 * storing anything — the label shown is the connected address.
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

  let email: string;
  try {
    const token = await nangoAccessToken(parsed.data.nangoConnectionId);
    email = (await gmailProfile(token)).emailAddress;
  } catch {
    return NextResponse.json(
      { error: "Gmail connection didn't complete — try connecting again." },
      { status: 502 },
    );
  }

  const connection = (
    await db()
      .insert(connections)
      .values({
        workspaceId: ctx.workspace.id,
        provider: "google-mail",
        nangoConnectionId: parsed.data.nangoConnectionId,
        externalAccountLabel: email,
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
        type: "email",
        connectionId: connection.id,
        displayName: `Email · ${email}`,
        config: {},
        capabilities: { supportsRichText: false },
      })
      .returning()
  )[0];

  return NextResponse.json({ connection, channel }, { status: 201 });
}
