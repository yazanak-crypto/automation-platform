import { describe, expect, it } from "vitest";
import { PLANS } from "../src/billing";

// Prices are quoted on the landing page, the billing page, checkout AND by the
// support assistant, all reading this object. A silent change here changes what
// customers are told they owe, so the numbers are asserted explicitly.

const PAID = ["entry", "starter", "growth", "pro"] as const;

describe("plan pricing", () => {
  it("matches the published prices", () => {
    expect(PLANS.entry.priceMonthlyUsd).toBe(39);
    expect(PLANS.entry.setupFeeUsd).toBe(49);
    expect(PLANS.starter.priceMonthlyUsd).toBe(99);
    expect(PLANS.growth.priceMonthlyUsd).toBe(249);
    expect(PLANS.pro.priceMonthlyUsd).toBe(499);
  });

  it("charges a setup fee on Entry only", () => {
    // Every surface renders the "setup fee covers your first month" copy
    // conditionally on this. If a second plan grows a setup fee, that copy and
    // paddle-verify's trial-period expectation both have to change with it.
    expect(PLANS.entry.setupFeeUsd).toBeGreaterThan(0);
    for (const id of ["starter", "growth", "pro"] as const) {
      expect(PLANS[id].setupFeeUsd).toBe(0);
    }
  });

  it("keeps Entry's setup fee above its monthly price", () => {
    // The setup fee IS month one, plus the implementation work. If it ever
    // drops below the monthly price the offer stops making sense — and the
    // page says "covers your first month", which would then be a worse deal
    // than simply subscribing.
    expect(PLANS.entry.setupFeeUsd).toBeGreaterThan(PLANS.entry.priceMonthlyUsd);
  });

  it("rises monotonically in price and in allowance", () => {
    // A tier that costs more but allows less (or vice versa) is a pricing bug
    // that no single-plan assertion would catch.
    for (let i = 1; i < PAID.length; i++) {
      const prev = PLANS[PAID[i - 1]!];
      const cur = PLANS[PAID[i]!];
      expect(cur.priceMonthlyUsd).toBeGreaterThan(prev.priceMonthlyUsd);
      expect(cur.monthlyCredits).toBeGreaterThan(prev.monthlyCredits);
    }
  });

  it("keeps the trial free and unpurchasable", () => {
    expect(PLANS.trial.priceMonthlyUsd).toBe(0);
    expect(PLANS.trial.setupFeeUsd).toBe(0);
  });
});
