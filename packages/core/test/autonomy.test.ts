import { describe, expect, it } from "vitest";
import { decideAction, resolvePolicy, type EffectivePolicy } from "../src/autonomy";
import { CATEGORIES, type AutonomyAction, type AutonomyPolicy, type Category } from "@platform/schemas";

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

describe("P0-3: holding line respects Supervised Mode", () => {
  it("only sends in smart mode, and only when not disabled", async () => {
    const { shouldSendHoldingLine } = await import("../src/autonomy");
    expect(shouldSendHoldingLine("smart", null)).toBe(true);
    expect(shouldSendHoldingLine("smart", { holdingLineEnabled: false })).toBe(false);
    expect(shouldSendHoldingLine("supervised", null)).toBe(false);
    expect(shouldSendHoldingLine("supervised", { holdingLineEnabled: true })).toBe(false);
  });
});

describe("empty reply: escalates everywhere EXCEPT order_intent", () => {
  // Why this carve-out exists: the drafting prompt tells the model to leave the
  // reply empty for order_intent, because the customer acknowledgement is
  // rendered server-side from the SAVED order rather than generated. Treating
  // that emptiness as "needs a human" made every order escalate before the
  // capture code could run — deterministically, never once firing in
  // production, with the run reading only "The AI judged this needs you
  // personally".
  const policy = {
    categoryActions: Object.fromEntries(CATEGORIES.map((c) => [c, "auto"])) as Record<
      Category,
      AutonomyAction
    >,
    minConfidence: 0.5,
  };

  const base = {
    mode: "smart" as const,
    policy,
    confidence: 0.95,
    grounded: true,
    boundaryCheckPassed: true,
    needsHuman: false,
    hasReply: false, // the empty reply under test
  };

  it("does NOT escalate order_intent for an empty reply", () => {
    const d = decideAction({ ...base, category: "order_intent" });
    expect(d.action).not.toBe("escalate");
    expect(d.reason).not.toMatch(/needs you personally/i);
  });

  it("STILL escalates every other category for an empty reply", () => {
    // The carve-out must be narrow. An empty reply anywhere else remains the
    // model declining to answer, which is a request for a human.
    for (const category of CATEGORIES) {
      if (category === "order_intent") continue;
      const d = decideAction({ ...base, category });
      expect(d.action, `${category} should escalate on an empty reply`).toBe("escalate");
    }
  });

  it("still escalates order_intent when the model asks for a human", () => {
    // needsHuman is how "commits but I cannot tell WHAT they want" reaches the
    // owner. The carve-out covers the empty reply only, never this.
    const d = decideAction({ ...base, category: "order_intent", needsHuman: true, hasReply: true });
    expect(d.action).toBe("escalate");
    expect(d.reason).toMatch(/needs you personally/i);
  });

  it("still escalates order_intent when BOTH are set", () => {
    const d = decideAction({ ...base, category: "order_intent", needsHuman: true });
    expect(d.action).toBe("escalate");
  });

  it("a non-empty reply is unaffected for every category", () => {
    for (const category of CATEGORIES) {
      const d = decideAction({ ...base, category, hasReply: true });
      expect(d.action, `${category} should not escalate on a real reply`).not.toBe("escalate");
    }
  });
});

describe("grounding gates CLAIMS, not replies", () => {
  // "Hey" -> "Hi there! How can I help you today?" queued for approval with
  // reason "Answer isn't fully backed by your confirmed Business Brain". The
  // reply asserted nothing, so there was nothing to ground; the gate could not
  // tell "no claims made" from "claims made without support" and treated the
  // safe case as the dangerous one.
  const policy = {
    categoryActions: Object.fromEntries(CATEGORIES.map((c) => [c, "auto"])) as Record<
      Category,
      AutonomyAction
    >,
    minConfidence: 0.7,
  };
  const base = {
    mode: "smart" as const,
    policy,
    category: "general_inquiry" as Category,
    confidence: 0.7,
    boundaryCheckPassed: true,
    needsHuman: false,
    hasReply: true,
    grounded: false,
  };

  it("auto-sends a pure greeting: ungrounded, but it claims nothing", () => {
    const d = decideAction({ ...base, makesFactualClaim: false });
    expect(d.action).toBe("auto_send");
  });

  it("still queues an ungrounded reply that DOES make a claim", () => {
    const d = decideAction({ ...base, makesFactualClaim: true });
    expect(d.action).toBe("draft_for_approval");
    expect(d.reason).toMatch(/isn't fully backed/i);
  });

  it("a grounded claim is unaffected", () => {
    expect(decideAction({ ...base, grounded: true, makesFactualClaim: true }).action).toBe(
      "auto_send",
    );
  });

  it("claiming nothing does not bypass any OTHER gate", () => {
    // The carve-out is about grounding alone. Confidence, boundaries and
    // needsHuman must all still apply to a claim-free reply.
    expect(
      decideAction({ ...base, makesFactualClaim: false, confidence: 0.2 }).action,
    ).toBe("draft_for_approval");
    expect(
      decideAction({ ...base, makesFactualClaim: false, boundaryCheckPassed: false }).action,
    ).toBe("escalate");
    expect(decideAction({ ...base, makesFactualClaim: false, needsHuman: true }).action).toBe(
      "escalate",
    );
  });
});

describe("an absent makesFactualClaim fails SAFE", () => {
  it("keeps the grounding gate active when the field is missing entirely", () => {
    // The trap this pins: `undefined` is falsy, so a truthiness check would
    // have DISABLED grounding for every caller that had not been updated —
    // older call sites, other automations, test fixtures. Only an explicit
    // `false` may relax the gate.
    const d = decideAction({
      mode: "smart",
      policy: {
        categoryActions: Object.fromEntries(CATEGORIES.map((c) => [c, "auto"])) as Record<
          Category,
          AutonomyAction
        >,
        minConfidence: 0.7,
      },
      category: "faq",
      confidence: 0.95,
      grounded: false,
      boundaryCheckPassed: true,
      needsHuman: false,
      hasReply: true,
      // makesFactualClaim deliberately omitted
    });
    expect(d.action).toBe("draft_for_approval");
    expect(d.reason).toMatch(/isn't fully backed/i);
  });
});
