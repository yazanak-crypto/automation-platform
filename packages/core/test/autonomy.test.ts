import { describe, expect, it } from "vitest";
import { decideAction, resolvePolicy, type EffectivePolicy } from "../src/autonomy";
import type { AutonomyPolicy, Category } from "@platform/schemas";

// AC-2.12/2.13/2.14 engine-level evals + policy resolution (Decision 012).

const leadConciergeDefault: AutonomyPolicy = {
  minConfidence: 0.8,
  categoryActions: {
    hours: "auto",
    location: "auto",
    shipping_info: "auto",
    faq: "auto",
    appointment_info: "auto",
    pricing_stated: "auto",
    product_availability: "auto",
    lead_inquiry: "approve",
    general_inquiry: "approve",
    product_recommendation: "approve",
    refund_request: "escalate",
    complaint: "escalate",
    negotiation: "escalate",
    sensitive: "escalate",
    unknown: "escalate",
  },
};

const policy = (): EffectivePolicy => resolvePolicy(leadConciergeDefault, null, null);

const base = {
  mode: "smart" as const,
  policy: policy(),
  confidence: 0.95,
  grounded: true,
  boundaryCheckPassed: true,
  needsHuman: false,
  hasReply: true,
};

describe("policy resolution (risk tiers + owner control)", () => {
  it("workspace maxAutoRisk=low caps medium-risk autos to approval", () => {
    const p = resolvePolicy(leadConciergeDefault, { maxAutoRisk: "low" }, null);
    expect(p.categoryActions.product_availability).toBe("approve"); // medium capped
    expect(p.categoryActions.faq).toBe("auto"); // low survives
  });

  it("maxAutoRisk=none means nothing auto-sends", () => {
    const p = resolvePolicy(leadConciergeDefault, { maxAutoRisk: "none" }, null);
    expect(Object.values(p.categoryActions)).not.toContain("auto");
  });

  it("activation override beats workspace setting beats default", () => {
    const p = resolvePolicy(
      leadConciergeDefault,
      { categoryOverrides: { faq: "approve" } },
      { categoryOverrides: { hours: "escalate" } },
    );
    expect(p.categoryActions.faq).toBe("approve"); // workspace
    expect(p.categoryActions.hours).toBe("escalate"); // activation wins
    expect(p.categoryActions.location).toBe("auto"); // default survives
  });

  it("M1 safety floor: high risk can NEVER resolve to auto, from any layer", () => {
    const p = resolvePolicy(
      leadConciergeDefault,
      { categoryOverrides: { refund_request: "auto" } },
      { categoryOverrides: { complaint: "auto", sensitive: "auto" } },
    );
    expect(p.categoryActions.refund_request).not.toBe("auto");
    expect(p.categoryActions.complaint).not.toBe("auto");
    expect(p.categoryActions.sensitive).not.toBe("auto");
  });
});

describe("AC-2.12: high-risk labeled set never auto-sends", () => {
  // 52 labeled scenarios: refunds, anger, negotiation, sensitive, unknown —
  // across confidence/grounding combinations. Zero may auto-send.
  const highRisk: Category[] = ["refund_request", "complaint", "negotiation", "sensitive", "unknown"];
  const cases = highRisk.flatMap((category) =>
    [0.99, 0.85, 0.5].flatMap((confidence) =>
      [true, false].flatMap((grounded) => [
        { category, confidence, grounded, needsHuman: false, hasReply: true },
        { category, confidence, grounded, needsHuman: true, hasReply: false },
      ]),
    ),
  );

  it(`zero of ${cases.length} high-risk cases auto-send; all carry a reason`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
    for (const c of cases) {
      const d = decideAction({ ...base, ...c });
      expect(d.action).not.toBe("auto_send");
      expect(d.action).toBe("escalate"); // configured escalate wins over everything
      expect(d.reason.length).toBeGreaterThan(5);
    }
  });
});

describe("AC-2.13: grounding gate", () => {
  it("auto-eligible category without brain grounding never auto-sends", () => {
    for (const category of ["hours", "faq", "shipping_info", "pricing_stated"] as Category[]) {
      const d = decideAction({ ...base, category, grounded: false });
      expect(d.action).toBe("draft_for_approval");
      expect(d.wouldAutoSend).toBe(false);
    }
  });

  it("low confidence degrades to approval", () => {
    const d = decideAction({ ...base, category: "faq", confidence: 0.6 });
    expect(d.action).toBe("draft_for_approval");
  });

  it("boundary failure escalates even for auto categories", () => {
    const d = decideAction({ ...base, category: "hours", boundaryCheckPassed: false });
    expect(d.action).toBe("escalate");
  });
});

describe("AC-2.14: mode semantics (kill switch)", () => {
  it("supervised mode downgrades auto_send to draft and records wouldAutoSend", () => {
    const d = decideAction({ ...base, mode: "supervised", category: "faq" });
    expect(d.action).toBe("draft_for_approval");
    expect(d.wouldAutoSend).toBe(true);
  });

  it("smart mode auto-sends the same input", () => {
    const d = decideAction({ ...base, category: "faq" });
    expect(d.action).toBe("auto_send");
    expect(d.wouldAutoSend).toBe(true);
  });

  it("approval categories draft in smart mode too", () => {
    const d = decideAction({ ...base, category: "lead_inquiry" });
    expect(d.action).toBe("draft_for_approval");
    expect(d.wouldAutoSend).toBe(false);
  });
});
