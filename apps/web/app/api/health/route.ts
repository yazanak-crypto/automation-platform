import { redis } from "@platform/core";
import { db } from "@platform/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Liveness/readiness probe for load balancers and uptime monitors. Public
// (no auth) and cheap; reports dependency health without leaking internals.
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "down" | "stale"> = {
    db: "down",
    redis: "down",
    worker: "down",
  };
  let heartbeat: string | null = null;
  await Promise.all([
    db()
      .execute(sql`select 1`)
      .then(() => {
        checks.db = "ok";
      })
      .catch(() => {}),
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
  const ok = checks.db === "ok" && checks.redis === "ok";
  return NextResponse.json(
    { ok, checks, workerHeartbeat: heartbeat, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
