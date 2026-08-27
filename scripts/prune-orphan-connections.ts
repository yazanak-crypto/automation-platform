/**
 * Remove WhatsApp `connections` rows that no channel points at.
 *
 * Run:  pnpm tsx scripts/prune-orphan-connections.ts           (dry run)
 *       pnpm tsx scripts/prune-orphan-connections.ts --apply   (deletes)
 *
 * WHY THESE EXIST
 *
 * scripts/whatsapp-setup.ts finds an existing channel by (workspace_id, type),
 * not by connection. So pointing the env credentials at a different WABA and
 * re-running creates a SECOND connection row while the channel stays attached
 * to the first. The new number works; the old connection is left with nothing
 * joined to it.
 *
 * WHY IT MATTERS
 *
 * resolveWhatsAppChannel INNER JOINs channels, so a connection with no channel
 * resolves to nothing: a message to that number is dropped with a one-line
 * console warning and no other trace. The row also occupies its phone number id
 * under the new unique index (0018), so a legitimate future re-provision of
 * that number would fail with a constraint error rather than an explanation.
 *
 * WHAT IT WILL NOT DO
 *
 * Only rows with NO channel are considered, and each candidate is checked
 * against the Meta Graph API first: a number that still resolves there is
 * REPORTED, never deleted, because that is a number someone may be mid-way
 * through wiring up rather than a leftover. Deleting is reserved for rows whose
 * number the current credentials cannot even see.
 *
 * The full row is printed before deletion so it can be recreated by hand.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "..", ".env") });

import { get } from "node:https";
import { channels, connections, db } from "@platform/db";
import { and, eq, isNull } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Does the current access token still know this phone number id?
 *
 * Uses node:https rather than the global fetch ON PURPOSE. Node's fetch keeps
 * undici sockets alive, and calling process.exit() while one is closing aborts
 * the process with a libuv assertion (exit 127) on Windows — which, for a
 * script that DELETES rows, would mean crashing part-way through with no
 * summary of what it had done. Reproduced in a five-line script; nothing to do
 * with this file's logic. Please do not "modernise" this back to fetch.
 */
function numberIsLive(phoneNumberId: string): Promise<boolean | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return Promise.resolve(null); // unknown — treated as "do not delete"
  const url = `${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=id`;
  return new Promise((resolve) => {
    const req = get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      res.resume(); // drain; only the status matters
      res.on("end", () => resolve((res.statusCode ?? 500) < 400));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(10_000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function main() {
  const orphans = await db()
    .select({ connection: connections })
    .from(connections)
    .leftJoin(channels, eq(channels.connectionId, connections.id))
    .where(and(eq(connections.provider, "whatsapp"), isNull(channels.id)));

  if (!orphans.length) {
    console.log("\nNo orphaned WhatsApp connections.\n");
    return;
  }

  console.log(`\nOrphaned WhatsApp connections (no channel points at them): ${orphans.length}\n`);

  const deletable: typeof orphans = [];
  for (const { connection: c } of orphans) {
    const live = c.providerAccountId ? await numberIsLive(c.providerAccountId) : null;
    const verdict =
      live === true
        ? "KEEP — number is still live on the current token; wire a channel to it instead"
        : live === null
          ? "KEEP — cannot check (no WHATSAPP_ACCESS_TOKEN); refusing to guess"
          : "DELETE — the current token cannot see this number at all";
    console.log(`  ${c.id}`);
    console.log(`    phone_number_id: ${c.providerAccountId}`);
    console.log(`    workspace:       ${c.workspaceId}`);
    console.log(`    label:           ${c.externalAccountLabel}`);
    console.log(`    nango ref:       ${c.nangoConnectionId}`);
    console.log(`    status:          ${c.status}   created: ${c.createdAt.toISOString()}`);
    console.log(`    → ${verdict}\n`);
    if (live === false) deletable.push({ connection: c });
  }

  if (!deletable.length) {
    console.log("Nothing is safe to delete. Nothing to do.\n");
    return;
  }
  if (!APPLY) {
    console.log(`Dry run — would delete ${deletable.length}. Re-run with --apply.\n`);
    return;
  }

  for (const { connection: c } of deletable) {
    await db().delete(connections).where(eq(connections.id, c.id));
    console.log(`  ✓ deleted ${c.id} (${c.providerAccountId})`);
  }
  console.log(`\nDeleted ${deletable.length}.\n`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
