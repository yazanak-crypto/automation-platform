import { z } from "zod";

// Order capture (v1). The AI captures, modifies quantities and reads history;
// it does not confirm, take payment, or check inventory. The auto-confirm gate
// exists and is exercised, but ships switched off — the decision point is built
// explicitly so enabling it later is a settings change, not a refactor.

export const ORDER_STATUSES = ["pending", "confirmed", "cancelled", "fulfilled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

/**
 * One line as the extractor returns it.
 *
 * No `knowledgeItemId`. Catalog matching happens SERVER-SIDE after extraction,
 * against the real table — asking a model to emit uuids invites hallucinated
 * ones that would point at another workspace's row or at nothing at all.
 */
export const orderItemCaptureSchema = z.object({
  name: z.string().min(1).max(300),
  quantity: z.number().int().positive().max(1000),
  notes: z.string().max(500).optional(),
});

/**
 * What the drafting model may emit alongside its reply.
 *
 * Optional at the top level, and the pipeline writes an order ONLY when the
 * classified category is `order_intent` AND this is present. Disagreement
 * between the two means no order: a missed capture costs the owner a manual
 * entry, while a false capture invents an order AND tells the customer it was
 * noted. The asymmetry is the whole design.
 */
export const orderCaptureSchema = z.object({
  items: z.array(orderItemCaptureSchema).min(1).max(50),
  customerName: z.string().max(200).optional(),
  /** The customer's own words: "tomorrow evening", "after 7". */
  requestedForText: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  /**
   * Set when the message MODIFIES an order already in flight ("make it 3
   * instead of 2"). The server validates that this id belongs to the same
   * contact before applying it — a model-supplied id is never trusted to
   * address a row on its own.
   */
  modifiesOrderId: z.string().uuid().optional(),
});
export type OrderCapture = z.infer<typeof orderCaptureSchema>;

// ── Auto-confirm settings ───────────────────────────────────────────────────

/**
 * Lives under `workspaces.autonomySettings.orders`, alongside the existing
 * `maxAutoRisk` / `categoryOverrides`, so the established layering (activation
 * override > workspace > automation default) applies without new machinery.
 */
export const orderSettingsSchema = z.object({
  /** Master switch. FALSE in v1 — owner confirmation is required. */
  autoConfirm: z.boolean().default(false),
  /** Ceiling in the workspace's currency. An order above it always waits. */
  maxAutoConfirmValue: z.number().nonnegative().default(0),
  /** Extraction confidence floor, same shape as the draft threshold. */
  minConfidence: z.number().min(0).max(1).default(0.9),
  /** Every line must resolve to a catalog item — an unmatched item is unpriced. */
  requireAllItemsLinked: z.boolean().default(true),
});
export type OrderSettings = z.infer<typeof orderSettingsSchema>;

export const DEFAULT_ORDER_SETTINGS: OrderSettings = {
  autoConfirm: false,
  maxAutoConfirmValue: 0,
  minConfidence: 0.9,
  requireAllItemsLinked: true,
};

// ── Owner-facing edit shapes ────────────────────────────────────────────────

export const orderItemPatchSchema = z.object({
  id: z.string().uuid().optional(),
  knowledgeItemId: z.string().uuid().nullable().optional(),
  nameText: z.string().min(1).max(300),
  quantity: z.number().int().positive().max(1000),
  unitPriceText: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const orderPatchSchema = z.object({
  customerName: z.string().max(200).nullable().optional(),
  requestedForText: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(orderItemPatchSchema).min(1).max(50).optional(),
});

export const orderDecisionSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
  /**
   * The message that goes to the customer. Always present and always editable:
   * the owner sees and can change both the confirmation and the cancellation
   * before it sends, rather than having them fire blind.
   */
  message: z.string().min(1).max(4000),
});
