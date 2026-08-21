import { afterEach, describe, expect, it, vi } from "vitest";

// The badge is the most-seen surface in the app, and it was wrong for every
// card-paying customer: it rendered workspaces.plan, a column only the manual
// bank-transfer path writes. These pin the contract that replaced it —
// derived entitlement in, customer-facing label out.

const getCreditStatus = vi.fn();
vi.mock("@platform/core", () => ({
  getCreditStatus: (...args: unknown[]) => getCreditStatus(...args),
  PLANS: {
    trial: { name: "Free trial" },
    starter: { name: "Starter" },
    pro: { name: "Premium" },
  },
}));

const { planBadge } = await import("./plan-badge");

afterEach(() => {
  getCreditStatus.mockReset();
  vi.restoreAllMocks();
});

describe("planBadge", () => {
  it("renders the marketing name, never the plan id", async () => {
    // "pro" is an internal id. A customer paying $599 should never see it.
    getCreditStatus.mockResolvedValue({ plan: "pro", trialEndsAt: null, trialEnded: false });
    await expect(planBadge("ws")).resolves.toEqual({
      plan: "pro",
      label: "Premium",
      trialDaysLeft: null,
    });
  });

  it("reports Starter without a trial countdown", async () => {
    getCreditStatus.mockResolvedValue({ plan: "starter", trialEndsAt: null, trialEnded: false });
    const r = await planBadge("ws");
    expect(r).toMatchObject({ plan: "starter", label: "Starter", trialDaysLeft: null });
  });

  it("counts remaining trial days, rounding up", async () => {
    // A trial with 6h left is "1 day left", not "0 days left".
    getCreditStatus.mockResolvedValue({
      plan: "trial",
      trialEndsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
      trialEnded: false,
    });
    expect((await planBadge("ws"))!.trialDaysLeft).toBe(1);

    getCreditStatus.mockResolvedValue({
      plan: "trial",
      trialEndsAt: new Date(Date.now() + 3.2 * 86_400_000).toISOString(),
      trialEnded: false,
    });
    expect((await planBadge("ws"))!.trialDaysLeft).toBe(4);
  });

  it("shows no countdown once the trial has ended", async () => {
    getCreditStatus.mockResolvedValue({
      plan: "trial",
      trialEndsAt: new Date(Date.now() - 3600_000).toISOString(),
      trialEnded: true,
    });
    const r = await planBadge("ws");
    expect(r).toMatchObject({ plan: "trial", label: "Free trial", trialDaysLeft: null });
  });

  it("returns null instead of throwing when entitlement cannot be read", async () => {
    // This runs in the app-shell layout. A Redis blip must not 500 every
    // authenticated page just to avoid rendering a chip.
    getCreditStatus.mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(planBadge("ws")).resolves.toBeNull();
  });

  it("does not surface the entitlement source", async () => {
    // Whether they paid by card or bank transfer is internal accounting.
    getCreditStatus.mockResolvedValue({
      plan: "starter",
      trialEndsAt: null,
      trialEnded: false,
      source: "manual",
    });
    expect(Object.keys((await planBadge("ws"))!)).toEqual(["plan", "label", "trialDaysLeft"]);
  });
});
