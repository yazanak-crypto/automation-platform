import { describe, expect, it } from "vitest";
import { GRADUATION, isGraduationEligible } from "../src/graduation";

// Boundary tests for the one prompt that asks an owner to let the AI send
// without approval. A false positive here is a trust failure, so each
// criterion is checked at and just below its threshold. No DB needed.

const AT_BAR = {
  approvals: GRADUATION.minApprovals,
  uneditedRate: GRADUATION.minUneditedRate,
  daysActive: GRADUATION.minDaysActive,
};

describe("isGraduationEligible", () => {
  it("qualifies exactly at the bar", () => {
    expect(isGraduationEligible(AT_BAR)).toBe(true);
  });

  it("requires all three — any single shortfall disqualifies", () => {
    expect(isGraduationEligible({ ...AT_BAR, approvals: GRADUATION.minApprovals - 1 })).toBe(false);
    expect(isGraduationEligible({ ...AT_BAR, uneditedRate: GRADUATION.minUneditedRate - 0.01 })).toBe(false);
    expect(isGraduationEligible({ ...AT_BAR, daysActive: GRADUATION.minDaysActive - 0.1 })).toBe(false);
  });

  it("never qualifies with zero approvals, however good the other numbers look", () => {
    // The rate is 0/0 in the caller, which must not read as a perfect score.
    expect(isGraduationEligible({ approvals: 0, uneditedRate: 1, daysActive: 365 })).toBe(false);
  });

  it("is not fooled by a perfect rate on a tiny sample", () => {
    // One unedited approval is a 100% rate — the volume gate is what stops it.
    expect(isGraduationEligible({ approvals: 1, uneditedRate: 1, daysActive: 30 })).toBe(false);
  });

  it("is not fooled by long tenure with no approvals", () => {
    expect(isGraduationEligible({ approvals: 2, uneditedRate: 1, daysActive: 400 })).toBe(false);
  });

  it("stays eligible comfortably past the bar", () => {
    expect(isGraduationEligible({ approvals: 50, uneditedRate: 0.98, daysActive: 60 })).toBe(true);
  });

  it("keeps the documented thresholds — changing these changes a trust promise", () => {
    expect(GRADUATION).toEqual({ minApprovals: 10, minUneditedRate: 0.9, minDaysActive: 7 });
  });
});
