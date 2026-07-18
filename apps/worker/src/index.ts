import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { startBrainWorkers } from "./brainJobs";
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

worker.on("ready", () => console.log("[worker] ready — connected to Redis"));
worker.on("failed", (job, err) =>
  console.error(`[worker] job ${job?.id} failed:`, err.message),
);

async function shutdown() {
  await Promise.all(brainWorkers.map((w) => w.close()));
  await worker.close();
  await systemQueue.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
