import { afterEach, describe, expect, it, vi } from "vitest";
import { listRemoteSubscriptions, paddleSyncConfigured, planForPaddlePrice } from "../src/paddleSync";

// Reconciliation is the recovery path for lost webhooks, so its parsing has to
// be right about the cases that only show up when something has ALREADY gone
// wrong: a subscription with no workspace attribution, an unrecognised price,
// a second page of results.

const STARTER = "pri_starter_recurring";
const PRO = "pri_pro_recurring";

function stubEnv() {
  vi.stubEnv("PADDLE_API_KEY", "pdl_test_key");
  vi.stubEnv("PADDLE_PRICE_STARTER", STARTER);
  vi.stubEnv("PADDLE_PRICE_PRO", PRO);
}

/** A Paddle /subscriptions list response, trimmed to what we read. */
function page(data: unknown[], next?: string) {
  return {
    ok: true,
    json: async () => ({
      data,
      meta: { pagination: { has_more: !!next, next } },
    }),
  } as unknown as Response;
}

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "trialing",
    customer_id: "ctm_1",
    custom_data: { workspaceId: "ws-1", plan: "starter" },
    items: [{ price: { id: STARTER } }],
    current_billing_period: { starts_at: "2026-08-20T00:00:00Z", ends_at: "2026-09-19T00:00:00Z" },
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("planForPaddlePrice", () => {
  it("maps recurring price ids to plans and rejects anything else", () => {
    stubEnv();
    expect(planForPaddlePrice(STARTER)).toBe("starter");
    expect(planForPaddlePrice(PRO)).toBe("pro");
    expect(planForPaddlePrice("pri_setup_fee")).toBeNull();
    expect(planForPaddlePrice("")).toBeNull();
  });

  it("does not match when the env var is unset", () => {
    // Otherwise an empty env var would make every unknown price resolve to a
    // plan, granting entitlement from a price we never sold.
    vi.stubEnv("PADDLE_PRICE_STARTER", "");
    expect(planForPaddlePrice("")).toBeNull();
  });
});

describe("paddleSyncConfigured", () => {
  it("is false without an API key, so the sweep no-ops instead of throwing", () => {
    vi.stubEnv("PADDLE_API_KEY", "");
    expect(paddleSyncConfigured()).toBe(false);
    vi.stubEnv("PADDLE_API_KEY", "pdl_x");
    expect(paddleSyncConfigured()).toBe(true);
  });
});

describe("listRemoteSubscriptions", () => {
  it("normalises a live subscription, including its billing period", async () => {
    stubEnv();
    vi.stubGlobal("fetch", vi.fn(async () => page([sub()])));

    const { subscriptions, skipped } = await listRemoteSubscriptions();
    expect(skipped).toEqual([]);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      subscriptionId: "sub_1",
      customerId: "ctm_1",
      workspaceId: "ws-1",
      plan: "starter",
      status: "trialing",
    });
    expect(subscriptions[0]!.currentPeriodEnd?.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("requests only entitling statuses", async () => {
    stubEnv();
    const f = vi.fn(async () => page([]));
    vi.stubGlobal("fetch", f);
    await listRemoteSubscriptions();
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.searchParams.get("status")).toBe("active,trialing,past_due");
  });

  it("skips — never silently drops — a subscription it cannot attribute", async () => {
    // This is our bug when it happens: a checkout created without custom_data.
    // Dropping it quietly would leave a paying customer invisible forever.
    stubEnv();
    vi.stubGlobal("fetch", vi.fn(async () => page([sub({ id: "sub_2", custom_data: null })])));

    const { subscriptions, skipped } = await listRemoteSubscriptions();
    expect(subscriptions).toEqual([]);
    expect(skipped).toEqual([{ id: "sub_2", reason: "no workspaceId in custom_data" }]);
  });

  it("skips a subscription whose price we do not recognise", async () => {
    stubEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page([sub({ id: "sub_3", items: [{ price: { id: "pri_unknown" } }] })])),
    );

    const { subscriptions, skipped } = await listRemoteSubscriptions();
    expect(subscriptions).toEqual([]);
    expect(skipped[0]).toEqual({ id: "sub_3", reason: "unrecognised price pri_unknown" });
  });

  it("follows pagination", async () => {
    stubEnv();
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        page([sub({ id: "sub_a" })], "https://sandbox-api.paddle.com/subscriptions?after=sub_a"),
      )
      .mockResolvedValueOnce(page([sub({ id: "sub_b" })]));
    vi.stubGlobal("fetch", f);

    const { subscriptions } = await listRemoteSubscriptions();
    expect(subscriptions.map((s) => s.subscriptionId)).toEqual(["sub_a", "sub_b"]);
    expect(new URL(String(f.mock.calls[1]![0])).searchParams.get("after")).toBe("sub_a");
  });

  it("throws on an API failure rather than reporting zero subscriptions", async () => {
    // Returning an empty list on an HTTP error would look identical to "nobody
    // is subscribed" — and the sweep would conclude everything is in sync.
    stubEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }) as unknown as Response),
    );
    await expect(listRemoteSubscriptions()).rejects.toThrow(/HTTP 401/);
  });
});
