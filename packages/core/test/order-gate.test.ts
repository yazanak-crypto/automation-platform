import { describe, expect, it } from "vitest";
import { DEFAULT_ORDER_SETTINGS, type OrderSettings } from "@platform/schemas";
import { resolveOrderSettings, shouldAutoConfirm, type AutoConfirmInput } from "../src/orderGate";

/** Everything passing, so each test can break exactly one thing. */
const OK: AutoConfirmInput = {
  captureConfidence: 0.95,
  totalEstimate: 40,
  allItemsLinked: true,
  boundaryCheckPassed: true,
  modifiesDecidedOrder: false,
};

/** Settings with the master switch ON, so the other gates are reachable. */
const ON: OrderSettings = {
  autoConfirm: true,
  maxAutoConfirmValue: 100,
  minConfidence: 0.9,
  requireAllItemsLinked: true,
};

describe("shouldAutoConfirm — the dangerous case", () => {
  it("REFUSES when the total is unknown, rather than treating it as zero", () => {
    // The whole point of the gate. Catalog prices are strings, so a total is
    // often genuinely unknowable — and unknown read as 0 would slip every
    // unpriceable order under every ceiling, including a ceiling of 0.
    const d = shouldAutoConfirm({ ...OK, totalEstimate: null }, ON);
    expect(d.confirm).toBe(false);
    expect(d.reason).toMatch(/value couldn't be worked out/i);
  });

  it("still refuses an unknown total when the limit is generous", () => {
    const d = shouldAutoConfirm({ ...OK, totalEstimate: null }, { ...ON, maxAutoConfirmValue: 1e9 });
    expect(d.confirm).toBe(false);
  });

  it("does not confuse a genuine zero with an unknown", () => {
    // A real 0.00 order is under any ceiling and may pass; null may not.
    expect(shouldAutoConfirm({ ...OK, totalEstimate: 0 }, ON).confirm).toBe(true);
  });
});

describe("shouldAutoConfirm — v1 ships off", () => {
  it("refuses by default, because autoConfirm defaults to false", () => {
    const d = shouldAutoConfirm(OK, DEFAULT_ORDER_SETTINGS);
    expect(d.confirm).toBe(false);
    expect(d.reason).toMatch(/off/i);
  });

  it("the master switch beats everything, even a perfect order", () => {
    expect(shouldAutoConfirm(OK, { ...ON, autoConfirm: false }).confirm).toBe(false);
  });
});

describe("shouldAutoConfirm — each gate", () => {
  it("refuses on a failed boundary check", () => {
    const d = shouldAutoConfirm({ ...OK, boundaryCheckPassed: false }, ON);
    expect(d.confirm).toBe(false);
    expect(d.reason).toMatch(/boundary/i);
  });

  it("refuses to re-confirm an order the owner already decided", () => {
    const d = shouldAutoConfirm({ ...OK, modifiesDecidedOrder: true }, ON);
    expect(d.confirm).toBe(false);
    expect(d.reason).toMatch(/already decided/i);
  });

  it("refuses when confidence is missing entirely", () => {
    expect(shouldAutoConfirm({ ...OK, captureConfidence: null }, ON).confirm).toBe(false);
  });

  it("refuses below the confidence floor and states both numbers", () => {
    const d = shouldAutoConfirm({ ...OK, captureConfidence: 0.7 }, ON);
    expect(d.confirm).toBe(false);
    expect(d.reason).toContain("0.70");
    expect(d.reason).toContain("0.90");
  });

  it("refuses an unmatched item when linking is required", () => {
    expect(shouldAutoConfirm({ ...OK, allItemsLinked: false }, ON).confirm).toBe(false);
  });

  it("allows an unmatched item when the owner turned that requirement off", () => {
    expect(
      shouldAutoConfirm({ ...OK, allItemsLinked: false }, { ...ON, requireAllItemsLinked: false })
        .confirm,
    ).toBe(true);
  });

  it("refuses above the value ceiling, and allows exactly at it", () => {
    expect(shouldAutoConfirm({ ...OK, totalEstimate: 101 }, ON).confirm).toBe(false);
    expect(shouldAutoConfirm({ ...OK, totalEstimate: 100 }, ON).confirm).toBe(true);
  });
});

describe("shouldAutoConfirm — every answer carries a reason", () => {
  it("never returns an empty reason, in either direction", () => {
    // "Why is this still pending?" must always be answerable. A bare boolean
    // is how that becomes unanswerable, which this codebase has paid for twice.
    const cases: AutoConfirmInput[] = [
      OK,
      { ...OK, totalEstimate: null },
      { ...OK, boundaryCheckPassed: false },
      { ...OK, captureConfidence: 0.1 },
      { ...OK, allItemsLinked: false },
      { ...OK, modifiesDecidedOrder: true },
    ];
    for (const c of cases) {
      for (const s of [ON, DEFAULT_ORDER_SETTINGS]) {
        expect(shouldAutoConfirm(c, s).reason.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("resolveOrderSettings", () => {
  it("defaults when the workspace has no orders block", () => {
    expect(resolveOrderSettings(null)).toEqual(DEFAULT_ORDER_SETTINGS);
    expect(resolveOrderSettings({})).toEqual(DEFAULT_ORDER_SETTINGS);
    expect(resolveOrderSettings({ maxAutoRisk: "medium" })).toEqual(DEFAULT_ORDER_SETTINGS);
  });

  it("reads a valid block", () => {
    const s = resolveOrderSettings({ orders: { autoConfirm: true, maxAutoConfirmValue: 50 } });
    expect(s.autoConfirm).toBe(true);
    expect(s.maxAutoConfirmValue).toBe(50);
    expect(s.minConfidence).toBe(0.9); // defaulted
  });

  it("falls back to OFF on a malformed block rather than reading it as permission", () => {
    const s = resolveOrderSettings({ orders: { autoConfirm: "yes", maxAutoConfirmValue: -5 } });
    expect(s).toEqual(DEFAULT_ORDER_SETTINGS);
    expect(s.autoConfirm).toBe(false);
  });
});
