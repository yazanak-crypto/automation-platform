import { describe, expect, it } from "vitest";
import {
  draftProfileOutputSchema,
  knowledgePatchSchema,
  profilePatchSchema,
} from "@platform/schemas";

describe("user-control guarantees (Decision 008)", () => {
  it("knowledge status can only move to confirmed or rejected — never back to suggested", () => {
    expect(knowledgePatchSchema.safeParse({ status: "confirmed" }).success).toBe(true);
    expect(knowledgePatchSchema.safeParse({ status: "rejected" }).success).toBe(true);
    expect(knowledgePatchSchema.safeParse({ status: "suggested" }).success).toBe(false);
  });

  it("profile patch rejects unknown fields (no smuggling brainVersion or status flags)", () => {
    expect(profilePatchSchema.safeParse({ brainVersion: 99 }).success).toBe(false);
    expect(
      profilePatchSchema.safeParse({ identity: { businessName: "Acme" } }).success,
    ).toBe(true);
  });

  it("onboardingStatus can only be set to confirmed/skipped by the user", () => {
    expect(profilePatchSchema.safeParse({ onboardingStatus: "draft_ready" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ onboardingStatus: "confirmed" }).success).toBe(true);
  });

  it("draft-profile model output has no way to express confirmation or status", () => {
    const parsed = draftProfileOutputSchema.parse({
      identity: { businessName: "Acme" },
      voice: {},
      policies: {},
      faqs: [{ question: "Q", answer: "A", status: "confirmed" }],
      products: [],
    });
    // unknown keys are stripped — model cannot inject status
    expect(JSON.stringify(parsed)).not.toContain("confirmed");
  });
});
