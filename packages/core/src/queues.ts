import { Queue } from "bullmq";
import IORedis from "ioredis";

// Shared queue definitions (web enqueues, worker consumes).

export const QUEUE_NAMES = {
  brainIngest: "brain.ingest",
  brainEmbed: "brain.embed",
  webchatDraft: "webchat.draft",
} as const;

/**
 * Shared BullMQ worker tuning. Applied to every worker so idle cost can't
 * drift back per-queue.
 *
 * An idle worker is not free: BullMQ long-polls the queue and periodically
 * sweeps for stalled jobs. At the defaults (drainDelay 5s, stalledInterval
 * 30s) three workers cost ~50k Redis commands a day doing nothing, which
 * exhausted a 500k/day quota in a single day.
 *
 * `drainDelay` costs no latency. It only sets how long the blocking call
 * waits WHEN THE QUEUE IS EMPTY — a newly enqueued job pushes to the list and
 * wakes the blocking command immediately, so a customer message is still
 * drafted in about a second.
 *
 * `stalledInterval` is a real trade: if the worker dies mid-job, that job now
 * waits up to 5 minutes to be retried instead of 30 seconds. Acceptable for a
 * single worker at low volume; revisit if jobs become latency-critical.
 */
export const WORKER_TUNING = {
  drainDelay: 60,
  stalledInterval: 300_000,
} as const;

export interface WebchatDraftJob {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}

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
export const webchatDraftQueue = () => queue(QUEUE_NAMES.webchatDraft);

/** Widget setup diagnostics (audit P1-9): remember the last origin we refused
 *  per widget key so the channels page can tell the owner what to allowlist. */
export async function recordBlockedOrigin(widgetKey: string, origin: string | null) {
  if (!origin) return;
  await redis()
    .set(`wc:blocked:${widgetKey}`, origin.slice(0, 200), "EX", 86400)
    .catch(() => {});
}

export async function getBlockedOrigin(widgetKey: string): Promise<string | null> {
  return redis().get(`wc:blocked:${widgetKey}`).catch(() => null);
}

/**
 * Simple Redis mutex (audit-2 P0-1): serializes draft processing per
 * conversation so concurrent jobs can't double-draft or double-auto-send.
 * Waits up to `waitMs` for the lock; returns null if it never acquires.
 */
export async function withRedisLock<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
  waitMs = 30_000,
): Promise<T | null> {
  const r = redis();
  const token = crypto.randomUUID();
  const fullKey = `lock:${key}`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const ok = await r.set(fullKey, token, "EX", ttlSec, "NX");
    if (ok) break;
    if (Date.now() > deadline) return null;
    await new Promise((res) => setTimeout(res, 400));
  }
  try {
    return await fn();
  } finally {
    // Release only our own token (avoid deleting a successor's lock after TTL).
    const val = await r.get(fullKey);
    if (val === token) await r.del(fullKey);
  }
}

/** Fixed-window rate limit. Returns true if the action is allowed. */
export async function takeLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const r = redis();
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const fullKey = `rl:${key}:${window}`;
  const n = await r.incr(fullKey);
  if (n === 1) await r.expire(fullKey, windowSec);
  return n <= max;
}

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
