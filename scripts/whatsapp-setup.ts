/**
 * Provision the WhatsApp channel for a workspace from the env credentials.
 *
 * Inbound routing is keyed on the business phone number id, which lives on a
 * `connections` row — so until this runs, a verified webhook arrives, finds no
 * channel, and is dropped with a "no active channel" warning.
 *
 * Usage:
 *   pnpm tsx scripts/whatsapp-setup.ts --workspace <uuid>
 *   pnpm tsx scripts/whatsapp-setup.ts --list        # show workspaces
 *
 * Idempotent: re-running updates the existing rows rather than duplicating.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "..", ".env") });

import { channels, connections, db, workspaces } from "@platform/db";
import { whatsappCredentials } from "@platform/channels";
import { and, eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

(async () => {
  if (process.argv.includes("--list")) {
    const rows = await db().select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
    for (const w of rows) console.log(`${w.id}  ${w.name}`);
    process.exit(0);
  }

  const workspaceId = arg("workspace");
  if (!workspaceId) {
    console.error("Missing --workspace <uuid>. Run with --list to see workspaces.");
    process.exit(1);
  }

  const creds = whatsappCredentials();
  if (!creds) {
    console.error(
      "WhatsApp env is incomplete. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID\n" +
        "in platform/.env (they already exist in Vercel; pull them down to run this locally).",
    );
    process.exit(1);
  }

  const ws = (
    await db().select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  )[0];
  if (!ws) {
    console.error(`No workspace ${workspaceId}. Run with --list.`);
    process.exit(1);
  }

  // The token is NOT stored — it stays in env and is read at send time. This
  // row exists to map phone number id → workspace, and to give the channel the
  // same shape as every other connected channel.
  const nangoRef = `env:whatsapp:${creds.phoneNumberId}`;
  const existingConn = (
    await db()
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.provider, "whatsapp"),
          eq(connections.providerAccountId, creds.phoneNumberId),
        ),
      )
      .limit(1)
  )[0];

  const connection =
    existingConn ??
    (
      await db()
        .insert(connections)
        .values({
          workspaceId,
          provider: "whatsapp",
          nangoConnectionId: nangoRef,
          providerAccountId: creds.phoneNumberId,
          externalAccountLabel: creds.businessAccountId
            ? `WABA ${creds.businessAccountId}`
            : `Phone ${creds.phoneNumberId}`,
          status: "active",
        })
        .returning()
    )[0]!;

  if (existingConn && existingConn.workspaceId !== workspaceId) {
    console.error(
      `Phone number ${creds.phoneNumberId} is already routed to workspace ${existingConn.workspaceId}.\n` +
        "One number can only serve one workspace — move it deliberately, don't duplicate it.",
    );
    process.exit(1);
  }

  // Match the channel by CONNECTION, not by (workspace_id, type).
  //
  // Matching by (workspace_id, type) treated a workspace as having one WhatsApp
  // channel that gets re-pointed. Swapping the env credentials to a different
  // WABA therefore created a second connection and moved the channel onto it,
  // stranding the first connection with nothing joined to it — and
  // resolveWhatsAppChannel INNER JOINs channels, so that number's messages were
  // then dropped at the door with a one-line warning. That is exactly what
  // happened in production (connection f45d4b66, pruned separately).
  //
  // One connection ↔ one channel is the honest model: routing is per phone
  // number, so a workspace serving two numbers genuinely has two channels.
  const existingChannel = (
    await db()
      .select()
      .from(channels)
      .where(and(eq(channels.connectionId, connection.id), eq(channels.type, "whatsapp")))
      .limit(1)
  )[0];

  const channel =
    existingChannel ??
    (
      await db()
        .insert(channels)
        .values({
          workspaceId,
          type: "whatsapp",
          connectionId: connection.id,
          displayName: "WhatsApp",
          status: "active",
          config: { connectedAt: new Date().toISOString(), webhookSubscribed: false },
        })
        .returning()
    )[0]!;

  // Re-activate a channel that had been switched off, but never re-point it —
  // its connection is its identity now.
  if (existingChannel && existingChannel.status !== "active") {
    await db()
      .update(channels)
      .set({ status: "active" })
      .where(eq(channels.id, existingChannel.id));
  }

  // The trade-off of the above, surfaced rather than hidden: numbers previously
  // provisioned for this workspace stay live instead of being displaced. That
  // is correct when a business really runs two numbers, and wrong when the env
  // credentials were simply swapped — and only the operator knows which. Say so
  // plainly instead of guessing.
  const siblings = await db()
    .select({ id: channels.id, connectionId: channels.connectionId, status: channels.status })
    .from(channels)
    .where(and(eq(channels.workspaceId, workspaceId), eq(channels.type, "whatsapp")));
  const others = siblings.filter((c) => c.connectionId !== connection.id);
  if (others.length) {
    console.log(
      `\n⚠️  This workspace has ${others.length} other WhatsApp channel(s), still active:`,
    );
    for (const o of others) {
      const conn = (
        await db().select().from(connections).where(eq(connections.id, o.connectionId!)).limit(1)
      )[0];
      console.log(`   channel ${o.id}  number ${conn?.providerAccountId}  (${o.status})`);
    }
    console.log(
      "   Both numbers will now receive. If you meant to REPLACE a number rather\n" +
        "   than add one, deactivate the old channel — this script will not guess.\n",
    );
  }

  console.log(`✅ WhatsApp wired up for "${ws.name}"`);
  console.log(`   workspace:   ${workspaceId}`);
  console.log(`   channel:     ${channel.id}`);
  console.log(`   connection:  ${connection.id}`);
  console.log(`   phone id:    ${creds.phoneNumberId}`);
  console.log(`
Remaining step (Meta side, once per app): in the Meta dashboard subscribe the
WhatsApp Business Account to this app's "messages" webhook field, pointing at

   https://ovanth.com/api/webhooks/meta

with your META_WEBHOOK_VERIFY_TOKEN. Until that subscription exists Meta sends
nothing, and the channel will look healthy while receiving no messages.
`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
