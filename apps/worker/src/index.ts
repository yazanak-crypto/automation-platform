import "./env";
import IORedis from "ioredis";
import * as Sentry from "@sentry/node";
import { closeIdleConversations } from "@platform/channels";
import { applyMigrations } from "@platform/db";
import { redis } from "@platform/core";
import { initSentry, sentryEnvironment } from "./sentry";

// Audit P1-10: error capture + heartbeat, both gated on env (no-op without).
//
// Logged either way. An empty DSN used to be indistinguishable from a working
// one — every captureException below was a silent no-op for months, which is
// why diagnosing a failed WhatsApp send meant querying production by hand.
// Now the worker says which mode it is in on every boot.
const sentryOn = initSentry();
console.log(
  sentryOn
    ? `[worker] Sentry on (environment: ${sentryEnvironment()})`
    : "[worker] Sentry OFF — SENTRY_DSN is not set; errors go to stdout only",
);
process.on("unhandledRejection", (err) => {
  console.error("[worker] unhandled rejection:", err);
  Sentry.captureException(err);
});
// An uncaught exception leaves the process in an undefined state. Report it, then
// exit so the process supervisor (systemd / PM2 / Docker `restart: always`)
// restarts a clean worker. Flush Sentry first so the error isn't lost.
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception — exiting for restart:", err);
  Sentry.captureException(err);
  void Sentry.close(2000).finally(() => process.exit(1));
});
import { startBrainWorkers } from "./brainJobs";
import { startBillingReconcile } from "./billingReconcile";
import { startEmailPolling } from "./emailPoll";
import { startWebchatWorker } from "./webchatDraft";

// Apply schema migrations before anything reads the database.
//
// A merged migration nobody ran took production down: the deployed code
// selected a column that did not exist. The worker is the right place for
// this — one long-running process, so two migrations cannot race, and it
// already holds the production credential. Failure exits loudly rather than
// leaving a half-migrated database.
//
// Migrations must stay EXPAND-ONLY: web and worker deploy independently, so
// old code briefly runs against the new schema.
try {
  const { applied } = await applyMigrations();
  console.log(
    applied > 0
      ? `[worker] applied ${applied} pending migration(s)`
      : "[worker] schema up to date",
  );
} catch (err) {
  console.error("[worker] MIGRATION FAILED — refusing to start:", err);
  Sentry.captureException(err);
  await Sentry.close(2000).catch(() => {});
  process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// The `system` queue and its worker were removed: nothing ever enqueued to
// them, but the worker still ran a blocking poll and a stalled-job sweep
// around the clock — a quarter of all idle Redis traffic for zero function.
// Add a real queue back here if a system job ever exists.

const brainWorkers = [...startBrainWorkers(connection), startWebchatWorker(connection)];
// The webchat worker is the one that matters, so it reports readiness.
const [, , webchatWorker] = brainWorkers;
const stopEmailPolling = startEmailPolling();
// Hourly Paddle drift repair. Paddle drops a failed webhook permanently after
// three attempts, so the push path alone can lose entitlement for a paying
// customer; this bounds that to an hour.
const stopBillingReconcile = startBillingReconcile();

// Audit P0-5: hourly sweep closes conversations idle >7 days (enables
// "returning visitor" continuity and keeps the inbox honest).
// Audit P1-10: heartbeat — /internal shows red if this stops beating.
const heartbeat = setInterval(() => {
  redis()
    .set("worker:heartbeat", new Date().toISOString(), "EX", 180)
    .catch((err) => console.error("[heartbeat] failed:", err.message));
}, 60_000);
redis().set("worker:heartbeat", new Date().toISOString(), "EX", 180).catch(() => {});

const idleSweep = setInterval(
  () =>
    closeIdleConversations().then(
      (n) => n > 0 && console.log(`[sweep] closed ${n} idle conversation(s)`),
      (err) => console.error("[sweep] failed:", err),
    ),
  60 * 60 * 1000,
);

webchatWorker?.on("ready", () => console.log("[worker] ready — connected to Redis"));

async function shutdown() {
  clearInterval(heartbeat);
  stopEmailPolling();
  stopBillingReconcile();
  clearInterval(idleSweep);
  await Promise.all(brainWorkers.map((w) => w.close()));
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
