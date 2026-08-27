import { describe, expect, it } from "vitest";
import { CATEGORIES, RISK_TIERS, webchatDraftOutputSchema } from "@platform/schemas";
import { renderOrderSummary } from "../src/orders";

// The DB-backed halves of the capture path (captureOrder, findModifiableOrder)
// are covered by the integration suite; these pin the contracts that decide
// whether an order is written at all.

describe("order_intent is a first-class category", () => {
  it("is in the taxonomy and carries medium risk", () => {
    expect(CATEGORIES).toContain("order_intent");
    // Medium, not low: a capture writes a real record AND tells a real
    // customer it was noted. It is an action, not an answer.
    expect(RISK_TIERS.order_intent).toBe("medium");
  });

  it("can never resolve to auto under a low risk tolerance", () => {
    // Not asserting the engine here — just that the tier makes the existing
    // maxAutoRisk dial able to hold order capture back, which is the point of
    // classifying it as medium rather than low.
    expect(["medium", "high"]).toContain(RISK_TIERS.order_intent);
  });
});

describe("draft output — order is optional and validated", () => {
  const base = {
    category: "order_intent",
    reply: "",
    reasoning: "customer committed",
    confidence: 0.9,
    groundedOnContext: false,
    needsHuman: false,
  };

  it("accepts a draft with no order at all", () => {
    // "Commits but unclear what" is a legitimate order_intent with no order
    // object — the owner itemises it, we do not guess.
    const parsed = webchatDraftOutputSchema.parse({ ...base, needsHuman: true });
    expect(parsed.order).toBeUndefined();
  });

  it("accepts a well-formed capture", () => {
    const parsed = webchatDraftOutputSchema.parse({
      ...base,
      order: { items: [{ name: "فتوش", quantity: 2 }], requestedForText: "tomorrow evening" },
    });
    expect(parsed.order?.items[0]?.name).toBe("فتوش");
    expect(parsed.order?.requestedForText).toBe("tomorrow evening");
  });

  it("REJECTS a zero or negative quantity rather than storing it", () => {
    // A non-positive line is an extraction bug, not an order. Rejected in the
    // schema and again by a database check, so neither layer relies on the other.
    for (const q of [0, -1, 1.5]) {
      expect(() =>
        webchatDraftOutputSchema.parse({ ...base, order: { items: [{ name: "x", quantity: q }] } }),
      ).toThrow();
    }
  });

  it("rejects an order with no items", () => {
    expect(() =>
      webchatDraftOutputSchema.parse({ ...base, order: { items: [] } }),
    ).toThrow();
  });

  it("rejects a non-uuid modifiesOrderId instead of letting it reach a query", () => {
    expect(() =>
      webchatDraftOutputSchema.parse({
        ...base,
        order: { items: [{ name: "x", quantity: 1 }], modifiesOrderId: "last-order" },
      }),
    ).toThrow();
  });

  it("has no field for a catalog id — matching is server-side", () => {
    // Asking a model for uuids invites hallucinated ones that point at another
    // workspace's row, or at nothing. The schema must not offer the slot.
    const parsed = webchatDraftOutputSchema.parse({
      ...base,
      order: { items: [{ name: "x", quantity: 1, knowledgeItemId: "00000000-0000-0000-0000-000000000000" }] },
    });
    expect(parsed.order?.items[0]).not.toHaveProperty("knowledgeItemId");
  });
});

describe("renderOrderSummary", () => {
  it("renders from persisted lines, preserving the customer's own words", () => {
    expect(
      renderOrderSummary([
        { nameText: "فتوش", quantity: 2 },
        { nameText: "Margherita", quantity: 1 },
      ]),
    ).toBe("2× فتوش, 1× Margherita");
  });

  it("is derivable only from rows — an empty order yields an empty summary", () => {
    // The acknowledgement is built from this. No rows means no summary, which
    // is what makes "never acknowledge an order that was not written" structural
    // rather than a rule someone has to remember.
    expect(renderOrderSummary([])).toBe("");
  });
});
