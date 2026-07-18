import { Queue } from "bullmq";
import IORedis from "ioredis";

// Shared queue definitions (web enqueues, worker consumes).

export const QUEUE_NAMES = {
  brainIngest: "brain.ingest",
  brainEmbed: "brain.embed",
  webchatDraft: "webchat.draft",
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
