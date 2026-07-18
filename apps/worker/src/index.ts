import "./env";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import * as Sentry from "@sentry/node";
import { closeIdleConversations } from "@platform/channels";
import { redis } from "@platform/core";

// Audit P1-10: error capture + heartbeat, both gated on env (no-op without).
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}
process.on("unhandledRejection", (err) => {
  console.error("[worker] unhandled rejection:", err);
  Sentry.captureException(err);
});
import { startBrainWorkers } from "./brainJobs";
import { startEmailPolling } from "./emailPoll";
import { startWebchatWorker } from "./webchatDraft";

// Worker skeleton: queue wiring + heartbeat only. Job processors land with
// their M1 steps (activation provisioning, run finalization, metering).

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const QUEUES = {
  system: "system",
} as const;

export const systemQueue = new Queue(QUEUES.system, { connection });

const worker = new Worker(
  QUEUES.system,
  async (job) => {
    console.log(`[worker] processed job ${job.name} (${job.id})`);
  },
  { connection },
);

const brainWorkers = [...startBrainWorkers(connection), startWebchatWorker(connection)];
const stopEmailPolling = startEmailPolling();

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

worker.on("ready", () => console.log("[worker] ready — connected to Redis"));
worker.on("failed", (job, err) =>
  console.error(`[worker] job ${job?.id} failed:`, err.message),
);

async function shutdown() {
  clearInterval(heartbeat);
  stopEmailPolling();
  clearInterval(idleSweep);
  await Promise.all(brainWorkers.map((w) => w.close()));
  await worker.close();
  await systemQueue.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
