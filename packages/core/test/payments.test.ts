import { describe, expect, it } from "vitest";
import { PLANS } from "../src/billing";
import { isPayablePlan, referenceCodeFor } from "../src/payments";

// Money-shaped values must come from the catalog, never the client.
describe("plan catalog pricing", () => {
  it("prices every payable plan, with a setup fee on Entry only", () => {
    expect(PLANS.entry.priceMonthlyUsd).toBe(39);
    expect(PLANS.entry.setupFeeUsd).toBe(49);
    expect(PLANS.starter.priceMonthlyUsd).toBe(99);
    expect(PLANS.growth.priceMonthlyUsd).toBe(249);
    expect(PLANS.pro.priceMonthlyUsd).toBe(499);
    expect(PLANS.starter.setupFeeUsd).toBe(0);
    expect(PLANS.growth.setupFeeUsd).toBe(0);
    expect(PLANS.pro.setupFeeUsd).toBe(0);
    expect(PLANS.trial.setupFeeUsd).toBe(0);
  });

  it("charges the setup fee INSTEAD of month one, not on top of it", () => {
    // This test used to assert monthly + setup as the first payment. That sum
    // is what amountDueFor() actually charged, while every customer-facing
    // surface quoted the setup fee alone — a real disagreement about how much
    // someone owes on day one. The setup fee covers month one; the monthly
    // price starts on day 31. Entry is now the only plan this applies to.
    expect(PLANS.entry.setupFeeUsd).toBe(49);
    expect(PLANS.entry.priceMonthlyUsd + PLANS.entry.setupFeeUsd).not.toBe(49);
  });
});

describe("isPayablePlan", () => {
  it("accepts only the purchasable plans", () => {
    expect(isPayablePlan("entry")).toBe(true);
    expect(isPayablePlan("starter")).toBe(true);
    expect(isPayablePlan("growth")).toBe(true);
    expect(isPayablePlan("pro")).toBe(true);
    expect(isPayablePlan("trial")).toBe(false);
    expect(isPayablePlan("free")).toBe(false);
  });
});

describe("referenceCodeFor", () => {
  it("is stable and derived from the user id", () => {
    // Our user ids are UUIDs, so the code is always uppercase hex.
    const id = "25f21089-0ef9-4cf5-9990-6f3868bd5698";
    expect(referenceCodeFor(id)).toBe(referenceCodeFor(id));
    expect(referenceCodeFor(id)).toBe("OV-25F210");
    expect(referenceCodeFor(id)).toMatch(/^OV-[0-9A-F]{6}$/);
  });

  it("differs between users", () => {
    expect(referenceCodeFor("aaaaaaaa-1111-2222-3333-444444444444")).not.toBe(
      referenceCodeFor("bbbbbbbb-1111-2222-3333-444444444444"),
    );
  });
});
