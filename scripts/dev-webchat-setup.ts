/**
 * Prepare a workspace for local web-chat testing.
 *
 * Creates (or updates) a web_chat channel and allow-lists the local test
 * origin, then prints the widget key and the ready-made test URL.
 *
 * Two traps this exists to remove:
 *   • An EMPTY allowedOrigins list blocks everything — a fresh channel is not
 *     "open by default", it is closed.
 *   • Origins are matched on protocol + host, so "localhost:8080" normalises to
 *     https:// and will NOT match a page served over http.
 *
 * Usage:
 *   pnpm tsx scripts/dev-webchat-setup.ts --list
 *   pnpm tsx scripts/dev-webchat-setup.ts --workspace <uuid> [--origin http://localhost:8080]
 *
 * Refuses to run against the production database unless --force is passed.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "..", ".env") });

import { channels, db, workspaces } from "@platform/db";
import { and, eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const PROD_HOST_HINT = "ep-delicate-wind";

(async () => {
  const url = process.env.DATABASE_URL ?? "";
  const looksProd = url.includes(PROD_HOST_HINT) && !url.includes("br-");
  if (looksProd && !process.argv.includes("--force")) {
    console.error(
      "Refusing to run: DATABASE_URL still points at the production branch.\n" +
        "Point it at your dev branch first, or pass --force if you really mean production.",
    );
    process.exit(1);
  }

  if (process.argv.includes("--list")) {
    const rows = await db().select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
    if (rows.length === 0) {
      console.log("No workspaces yet — sign in to the app once and they'll be created.");
    }
    for (const w of rows) console.log(`${w.id}  ${w.name}`);
    process.exit(0);
  }

  const workspaceId = arg("workspace");
  if (!workspaceId) {
    console.error("Missing --workspace <uuid>. Run with --list first.");
    process.exit(1);
  }
  const origin = arg("origin") ?? "http://localhost:8080";
  if (!/^https?:\/\//.test(origin)) {
    console.error(`--origin must include the protocol, e.g. http://localhost:8080 (got "${origin}")`);
    process.exit(1);
  }

  const ws = (
    await db().select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  )[0];
  if (!ws) {
    console.error(`No workspace ${workspaceId}. Run with --list.`);
    process.exit(1);
  }

  const existing = (
    await db()
      .select()
      .from(channels)
      .where(and(eq(channels.workspaceId, workspaceId), eq(channels.type, "web_chat")))
      .limit(1)
  )[0];

  let channel = existing;
  if (channel) {
    const allowed = new Set(channel.config.allowedOrigins ?? []);
    allowed.add(origin);
    const updated = await db()
      .update(channels)
      .set({ config: { ...channel.config, allowedOrigins: [...allowed] }, status: "active" })
      .where(eq(channels.id, channel.id))
      .returning();
    channel = updated[0] ?? channel;
  } else {
    channel = (
      await db()
        .insert(channels)
        .values({
          workspaceId,
          type: "web_chat",
          displayName: "Website chat",
          status: "active",
          config: { allowedOrigins: [origin] },
          capabilities: { supportsRichText: false },
        })
        .returning()
    )[0]!;
  }

  console.log(`✅ Web chat ready for "${ws.name}"`);
  console.log(`   widget key:      ${channel.widgetKey}`);
  console.log(`   allowed origins: ${(channel.config.allowedOrigins ?? []).join(", ")}`);
  console.log(`\nOpen the test page at:\n   ${origin}/?key=${channel.widgetKey}\n`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
