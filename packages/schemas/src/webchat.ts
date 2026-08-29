import { z } from "zod";

export const webchatInboundSchema = z.object({
  visitorId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  clientMessageId: z.string().uuid(),
  // Optional identity, volunteered by the visitor in the widget. Both are
  // skippable by design — a visitor who just wants to ask a question must
  // never be blocked by a form. Empty strings are coerced away so a skipped
  // form doesn't overwrite details we already have.
  email: z
    .string()
    .email()
    .max(300)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  name: z
    .string()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const channelCreateSchema = z.object({
  type: z.literal("web_chat"),
  displayName: z.string().min(1).max(100).default("Website chat"),
  allowedOrigins: z.array(z.string().max(300)).max(10).default([]),
});

export const channelPatchSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    allowedOrigins: z.array(z.string().max(300)).max(10).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    regenerateKey: z.boolean().optional(),
  })
  .strict();

export const draftActionSchema = z.object({
  action: z.enum(["approve", "dismiss"]),
  editedBody: z.string().min(1).max(4000).optional(),
});

export const manualReplySchema = z.object({ body: z.string().min(1).max(4000) });

import { CATEGORIES } from "./autonomy";
import { orderCaptureSchema } from "./orders";

/** Strict shape of the webchat draft prompt output (v3 — Decision 012). */
export const webchatDraftOutputSchema = z.object({
  category: z.enum([...CATEGORIES, "spam", "abusive"] as [string, ...string[]]),
  hot: z.boolean().default(false),
  reply: z.string().max(4000),
  reasoning: z.string().max(1000),
  usedFacts: z.array(z.string().max(300)).max(20).default([]),
  groundedOnContext: z.boolean().default(false),
  /**
   * Does the reply assert anything about the business at all?
   *
   * Defaults to TRUE — the safe direction. A model that omits the field, or an
   * older prompt that never emits it, is treated as making claims, so the
   * grounding gate still applies.
   */
  makesFactualClaim: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0),
  needsHuman: z.boolean().default(false),
  /**
   * Present ONLY for category order_intent. The pipeline writes an order when
   * BOTH agree; disagreement means no order. A missed capture costs the owner
   * a manual entry, a false one invents an order and tells a real customer it
   * was noted — so the two must corroborate each other.
   */
  order: orderCaptureSchema.optional(),
});
export type WebchatDraftOutput = z.infer<typeof webchatDraftOutputSchema>;

export const boundaryCheckOutputSchema = z.object({
  violates: z.boolean(),
  rule: z.string().max(500).optional(),
});
