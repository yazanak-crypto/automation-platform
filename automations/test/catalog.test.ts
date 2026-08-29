import { describe, expect, it } from "vitest";
import { CATALOG, getDefinition, leadConciergeConfigSchema } from "../index";
import { leadConcierge } from "../definitions/lead-concierge";
import { activationAutonomySchema } from "@platform/schemas";

describe("catalog integrity", () => {
  it("slugs are unique and definitions complete", () => {
    const slugs = CATALOG.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const d of CATALOG) {
      expect(d.definition.howItWorks.length).toBeGreaterThanOrEqual(3);
      expect(d.definition.sampleMessages.length).toBeGreaterThan(0);
      expect(d.definition.metricsContract.length).toBeGreaterThan(0);
      expect(d.definition.setupMinutes).toBeGreaterThan(0);
    }
  });

  it("every config field is accepted by the automation's own schema", () => {
    for (const d of CATALOG) {
      const sample = Object.fromEntries(d.definition.configFields.map((f) => [f.key, "test"]));
      expect(d.configSchema.safeParse(sample).success).toBe(true);
    }
  });

  it("lead-concierge config schema is strict (no smuggled keys)", () => {
    expect(leadConciergeConfigSchema.safeParse({ evil: "x" }).success).toBe(false);
    expect(leadConciergeConfigSchema.safeParse({}).success).toBe(true);
    expect(
      leadConciergeConfigSchema.safeParse({ leadDefinition: "asks about pricing" }).success,
    ).toBe(true);
  });

  it("getDefinition resolves known slugs only", () => {
    expect(getDefinition("lead-concierge")?.name).toBe("Lead Concierge");
    expect(getDefinition("nope")).toBeUndefined();
  });
});

describe("lead-concierge confidence threshold", () => {
  // The UI on /automations/[id] offers three presets. The recommended default
  // must BE one of them, otherwise a workspace that has never touched the
  // setting shows no highlighted button and the control looks broken — the
  // active preset is matched against the EFFECTIVE value, which for an
  // untouched workspace is this default.
  const UI_PRESETS = [0.85, 0.7, 0.55];

  it("is 0.70", () => {
    expect(leadConcierge.autonomyPolicy.minConfidence).toBe(0.7);
  });

  it("matches one of the UI presets, so a default workspace shows a selection", () => {
    expect(UI_PRESETS).toContain(leadConcierge.autonomyPolicy.minConfidence);
  });

  it("sits within the range the override schema accepts", () => {
    // activationAutonomySchema clamps overrides to 0.5–1. A default outside
    // that range could not be re-selected once a customer changed it.
    for (const p of UI_PRESETS) {
      expect(activationAutonomySchema.safeParse({ minConfidence: p }).success).toBe(true);
    }
  });
});
