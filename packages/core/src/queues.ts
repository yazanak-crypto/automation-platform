import { Queue } from "bullmq";
import IORedis from "ioredis";

// Shared queue definitions (web enqueues, worker consumes).

export const QUEUE_NAMES = {
  brainIngest: "brain.ingest",
  brainEmbed: "brain.embed",
} as const;

export interface BrainIngestJob {
  workspaceId: string;
  url: string;
}
export interface BrainEmbedJob {
  workspaceId: string;
  knowledgeItemId: string;
}

let _redis: IORedis | undefined;
export function redis(): IORedis {
  _redis ??= new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  return _redis;
}

const _queues = new Map<string, Queue>();
function queue(name: string): Queue {
  let q = _queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis() });
    _queues.set(name, q);
  }
  return q;
}

export const brainIngestQueue = () => queue(QUEUE_NAMES.brainIngest);
export const brainEmbedQueue = () => queue(QUEUE_NAMES.brainEmbed);

/** Sliding daily cap via Redis. Returns true if the action is allowed. */
export async function takeDailyLimit(
  key: string,
  max: number,
): Promise<boolean> {
  const r = redis();
  const fullKey = `ratelimit:${key}:${new Date().toISOString().slice(0, 10)}`;
  const n = await r.incr(fullKey);
  if (n === 1) await r.expire(fullKey, 60 * 60 * 24);
  return n <= max;
}
