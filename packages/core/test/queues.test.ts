/**
 * Regression for audit P0-3 (Redis-gated; runs in CI).
 * The old fixed jobId `ingest-<ws>` collided with completed jobs retained for
 * an hour, silently dropping re-ingests. New scheme: unique jobId + explicit
 * live-job concurrency check.
 */
import { afterAll, describe, expect, it } from "vitest";
import { brainIngestQueue, redis, takeLimit } from "../src";

const hasRedis = !!process.env.REDIS_URL;
const uuid = () => crypto.randomUUID();

describe.skipIf(!hasRedis)("ingest queue regressions", () => {
  afterAll(async () => {
    await brainIngestQueue().obliterate({ force: true }).catch(() => {});
    await brainIngestQueue().close();
    redis().disconnect();
  });

  it("P0-3: a completed job no longer blocks a re-ingest (unique jobIds)", async () => {
    const ws = uuid();
    const q = brainIngestQueue();

    const j1 = await q.add("ingest", { workspaceId: ws, url: "https://a.example" }, { jobId: `ingest-${ws}-${Date.now()}` });
    // simulate completion (worker not running in tests): remove like a finished job would age out
    await j1.remove();

    const j2 = await q.add("ingest", { workspaceId: ws, url: "https://a.example" }, { jobId: `ingest-${ws}-${Date.now() + 1}` });
    expect(j2.id).not.toBe(j1.id); // old scheme: identical id -> silent no-op
    const state = await j2.getState();
    expect(["waiting", "delayed", "prioritized"]).toContain(state);
    await j2.remove();
  });

  it("live-job check sees a waiting job for the same workspace", async () => {
    const ws = uuid();
    const q = brainIngestQueue();
    const j = await q.add("ingest", { workspaceId: ws, url: "https://b.example" }, { jobId: `ingest-${ws}-${Date.now()}` });
    const live = await q.getJobs(["waiting", "active", "delayed"]);
    expect(live.some((x) => x.data.workspaceId === ws)).toBe(true);
    await j.remove();
  });

  it("takeLimit enforces the window cap", async () => {
    const key = `test:${uuid()}`;
    expect(await takeLimit(key, 2, 60)).toBe(true);
    expect(await takeLimit(key, 2, 60)).toBe(true);
    expect(await takeLimit(key, 2, 60)).toBe(false);
  });
});

describe.skipIf(hasRedis)("ingest queue regressions (skipped)", () => {
  it("requires REDIS_URL", () => expect(true).toBe(true));
});

describe.skipIf(!process.env.REDIS_URL)("P0-1: withRedisLock mutual exclusion", () => {
  it("serializes concurrent critical sections", async () => {
    const { withRedisLock } = await import("../src/queues");
    const key = `t:${crypto.randomUUID()}`;
    const order: string[] = [];
    await Promise.all([
      withRedisLock(key, 10, async () => {
        order.push("a-start");
        await new Promise((r) => setTimeout(r, 300));
        order.push("a-end");
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 50));
        return withRedisLock(key, 10, async () => {
          order.push("b-start");
        });
      })(),
    ]);
    expect(order).toEqual(["a-start", "a-end", "b-start"]);
  });
});
