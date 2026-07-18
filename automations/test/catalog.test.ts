import { describe, expect, it } from "vitest";
import { CATALOG, getDefinition, leadConciergeConfigSchema } from "../index";

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
