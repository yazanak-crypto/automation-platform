import type { AutonomyPolicy } from "@platform/schemas";
import type { z } from "zod";

// Catalog-as-code (Decision 009): each automation is a data object. Adding
// automation #2 means adding a definition file here — no app code changes.

export interface AutomationDefinition {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  tier: "starter" | "pro";
  version: number;
  /** Validates activation config server-side; configFields render the form. */
  configSchema: z.ZodType<Record<string, unknown> | undefined>;
  /** Recommended autonomy policy (Decision 012) — the owner can override it. */
  autonomyPolicy: AutonomyPolicy;
  definition: {
    howItWorks: string[];
    requiredCapabilities: string[];
    contextNeeds: string[];
    configFields: {
      key: string;
      label: string;
      type: "text" | "textarea";
      placeholder?: string;
      help?: string;
    }[];
    sampleMessages: string[];
    metricsContract: { key: string; label: string }[];
    setupMinutes: number;
  };
}
