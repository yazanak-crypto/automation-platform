import { z } from "zod";

export const webchatInboundSchema = z.object({
  visitorId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  clientMessageId: z.string().uuid(),
  email: z.string().email().max(300).optional(),
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

/** Strict shape of the webchat draft prompt output. */
export const webchatDraftOutputSchema = z.object({
  classification: z.enum(["question", "lead", "spam", "abusive", "other"]),
  hot: z.boolean().default(false),
  reply: z.string().max(4000),
  reasoning: z.string().max(1000),
  usedFacts: z.array(z.string().max(300)).max(20).default([]),
  needsHuman: z.boolean().default(false),
});
export type WebchatDraftOutput = z.infer<typeof webchatDraftOutputSchema>;

export const boundaryCheckOutputSchema = z.object({
  violates: z.boolean(),
  rule: z.string().max(500).optional(),
});
