import { describe, expect, it } from "vitest";
import { PLANS } from "../src/billing";

// Prices are quoted on the landing page, the billing page, checkout AND by the
// support assistant, all reading this object. A silent change here changes what
// customers are told they owe, so the numbers are asserted explicitly.

describe("plan pricing", () => {
  it("matches the published prices", () => {
    expect(PLANS.starter.setupFeeUsd).toBe(499);
    expect(PLANS.starter.priceMonthlyUsd).toBe(399);
    expect(PLANS.pro.setupFeeUsd).toBe(799);
    expect(PLANS.pro.priceMonthlyUsd).toBe(599);
  });

  it("keeps the setup fee above the monthly price", () => {
    // The setup fee IS month one, plus the implementation work. If it ever
    // drops below the monthly price the offer stops making sense — and every
    // surface says "covers your first month", which would then be a worse deal
    // than simply subscribing.
    for (const id of ["starter", "pro"] as const) {
      expect(PLANS[id].setupFeeUsd).toBeGreaterThan(PLANS[id].priceMonthlyUsd);
    }
  });

  it("prices Premium above Starter on both axes", () => {
    expect(PLANS.pro.setupFeeUsd).toBeGreaterThan(PLANS.starter.setupFeeUsd);
    expect(PLANS.pro.priceMonthlyUsd).toBeGreaterThan(PLANS.starter.priceMonthlyUsd);
    expect(PLANS.pro.monthlyCredits).toBeGreaterThan(PLANS.starter.monthlyCredits);
  });

  it("keeps the trial free and unpurchasable", () => {
    expect(PLANS.trial.priceMonthlyUsd).toBe(0);
    expect(PLANS.trial.setupFeeUsd).toBe(0);
  });
});
