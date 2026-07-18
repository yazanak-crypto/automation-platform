import { z } from "zod";

// Autonomy model (Decision 012). The category taxonomy, risk tiers, and
// policy shapes shared by the engine, the catalog, the prompt schema, and UI.

export const CATEGORIES = [
  "hours",
  "location",
  "shipping_info",
  "faq",
  "appointment_info",
  "pricing_stated",
  "product_availability",
  "product_recommendation",
  "lead_inquiry",
  "general_inquiry",
  "refund_request",
  "complaint",
  "negotiation",
  "sensitive",
  "unknown",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const categorySchema = z.enum(CATEGORIES);

export type RiskTier = "low" | "medium" | "high";

/** Fixed category → risk mapping (Decision 012 §2). Owners think in tiers. */
export const RISK_TIERS: Record<Category, RiskTier> = {
  hours: "low",
  location: "low",
  shipping_info: "low",
  faq: "low",
  appointment_info: "low",
  pricing_stated: "low",
  product_availability: "medium",
  product_recommendation: "medium",
  lead_inquiry: "medium",
  general_inquiry: "medium",
  refund_request: "high",
  complaint: "high",
  negotiation: "high",
  sensitive: "high",
  unknown: "high",
};

export const AUTONOMY_ACTIONS = ["auto", "approve", "escalate"] as const;
export type AutonomyAction = (typeof AUTONOMY_ACTIONS)[number];
export const autonomyActionSchema = z.enum(AUTONOMY_ACTIONS);

/** Per-automation recommended policy (catalog-as-code). */
export interface AutonomyPolicy {
  categoryActions: Partial<Record<Category, AutonomyAction>>;
  minConfidence: number;
}

/** Workspace-level risk tolerance (Decision 012 refinement). */
export const workspaceAutonomySchema = z
  .object({
    maxAutoRisk: z.enum(["none", "low", "medium"]).optional(),
    categoryOverrides: z.record(categorySchema, autonomyActionSchema).optional(),
  })
  .strict();
export type WorkspaceAutonomySettings = z.infer<typeof workspaceAutonomySchema>;

/** Per-activation fine-tuning. */
export const activationAutonomySchema = z
  .object({
    categoryOverrides: z.record(categorySchema, autonomyActionSchema).optional(),
    holdingLineEnabled: z.boolean().optional(),
    minConfidence: z.number().min(0.5).max(1).optional(),
  })
  .strict();
export type ActivationAutonomyOverrides = z.infer<typeof activationAutonomySchema>;
