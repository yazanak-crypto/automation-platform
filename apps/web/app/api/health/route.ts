import { redis } from "@platform/core";
import { db, pendingMigrationCount } from "@platform/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Liveness/readiness probe for load balancers and uptime monitors. Public
// (no auth) and cheap; reports dependency health without leaking internals.
export const dynamic = "force-dynamic";

/**
 * Migration drift, reported as a THREE-state result.
 *
 * The previous shape was a bare `number | null`, initialised to null and set by
 * a promise whose rejection was swallowed. So a broken check and a healthy one
 * were indistinguishable: production sat at `pendingMigrations: null` while two
 * unapplied migrations took `/dashboard` down twice. `null` looked reassuring
 * and meant "I have no idea".
 *
 * "unknown" is now explicit, carries the reason, and never masquerades as zero.
 */
type MigrationReport =
  | { status: "ok"; pending: 0 }
  | { status: "pending"; pending: number }
  | { status: "unknown"; error: string };

async function checkMigrations(): Promise<MigrationReport> {
  try {
    const pending = await pendingMigrationCount();
    return pending === 0 ? { status: "ok", pending: 0 } : { status: "pending", pending };
  } catch (err) {
    // Surfaced, not swallowed. The failure mode that hid twice was an ENOENT
    // on the journal in a bundled serverless function.
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[health] migration check failed:", message);
    return { status: "unknown", error: message.slice(0, 200) };
  }
}

export async function GET() {
  const checks: Record<string, "ok" | "down" | "stale"> = {
    db: "down",
    redis: "down",
    worker: "down",
  };
  let heartbeat: string | null = null;

  // Migrations come back as a RETURN VALUE rather than a mutated variable:
  // assigning inside a .then() left TypeScript narrowing the type to the
  // initialiser, and more importantly it was the shape that made swallowing the
  // error easy in the first place.
  const [, migrations] = await Promise.all([
    db()
      .execute(sql`select 1`)
      .then(() => {
        checks.db = "ok";
      })
      .catch(() => {}),
    checkMigrations(),
    (async () => {
      try {
        await redis().ping();
        checks.redis = "ok";
        // The worker refreshes this key every 60s (EX 180). Missing or stale =
        // the worker (drafting + delivery) is down — page on this.
        heartbeat = await redis().get("worker:heartbeat");
        if (heartbeat) {
          const ageMs = Date.now() - new Date(heartbeat).getTime();
          checks.worker = ageMs < 180_000 ? "ok" : "stale";
        }
      } catch {
        /* redis down — reflected above */
      }
    })(),
  ]);

  // db + redis are hard failures (503). A stale/down worker is reported but does
  // not fail the web liveness check — it's surfaced for alerting.
  //
  // Migrations do not fail the probe either: pending ones may be harmless until
  // a request reaches the new column, and a broken CHECK is not a broken app.
  // But neither is allowed to look healthy — `checks.migrations` carries the
  // real state so a monitor can alert on "pending" or "unknown", and so this
  // endpoint answers "why is the site broken?" in one call.
  checks.migrations = migrations.status === "ok" ? "ok" : "down";

  const ok = checks.db === "ok" && checks.redis === "ok";
  return NextResponse.json(
    {
      ok,
      checks,
      migrations,
      // Kept for existing monitors. Now genuinely a count or null-because-
      // unknown, with `migrations.status` saying which.
      pendingMigrations: migrations.status === "unknown" ? null : migrations.pending,
      workerHeartbeat: heartbeat,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
