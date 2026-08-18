import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { db } from "./index";

// Schema migrations, applied automatically instead of by hand.
//
// A merged migration that nobody ran took production down: the deployed code
// selected `business_profiles.answers`, the column did not exist, and every
// profile read threw. Nothing about the deploy looked wrong, because nothing
// about the deploy WAS wrong.
//
// The worker applies these on boot rather than the web build doing it:
//   • the worker is ONE long-running process, so two migrations cannot race;
//     Vercel builds run for previews too, and can run concurrently
//   • it already holds the production credential — no new secret anywhere
//   • failure is loud: the process exits, the heartbeat stops, /internal goes
//     red, rather than a half-migrated database sitting quietly
//
// Migrations must stay EXPAND-ONLY (add columns/tables, never drop or rename
// in the same release). The web app and the worker deploy independently, so
// for a few seconds the old code runs against the new schema. Additive changes
// are invisible to old code; destructive ones are an outage.

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

interface JournalEntry {
  idx: number;
  tag: string;
}

/** Migration tags on disk, in order, from drizzle's journal. */
export function journalTags(folder = MIGRATIONS_FOLDER): string[] {
  const raw = readFileSync(join(folder, "meta", "_journal.json"), "utf8");
  const journal = JSON.parse(raw) as { entries: JournalEntry[] };
  return journal.entries.sort((a, b) => a.idx - b.idx).map((e) => e.tag);
}

/**
 * How many migrations exist on disk but have not been applied to this database.
 *
 * Compares COUNTS, not hashes: drizzle records a hash of each applied file, and
 * re-deriving those here would duplicate its internals and drift from them. A
 * count mismatch is the condition that actually hurt us — files merged, never
 * applied.
 */
export async function pendingMigrationCount(): Promise<number> {
  const onDisk = journalTags().length;
  try {
    const rows = (await db().execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    )) as unknown as { n: number }[];
    const applied = Number(rows[0]?.n ?? 0);
    return Math.max(onDisk - applied, 0);
  } catch {
    // No drizzle schema yet — nothing has ever been applied to this database.
    return onDisk;
  }
}

/**
 * Apply any pending migrations. Safe to call on every boot: drizzle skips
 * everything already recorded, so a no-op costs one query.
 */
export async function applyMigrations(): Promise<{ applied: number }> {
  const before = await pendingMigrationCount();
  if (before === 0) return { applied: 0 };
  await migrate(db(), { migrationsFolder: MIGRATIONS_FOLDER });
  const after = await pendingMigrationCount();
  return { applied: before - after };
}
