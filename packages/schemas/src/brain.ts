import { z } from "zod";

export const identitySchema = z.object({
  businessName: z.string().max(200).optional(),
  url: z.string().url().max(500).optional(),
  industry: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  offerings: z.array(z.string().max(500)).max(50).optional(),
});

export const voiceSchema = z.object({
  tone: z.array(z.string().max(50)).max(10).optional(),
  formality: z.string().max(50).optional(),
  languages: z.array(z.string().max(50)).max(10).optional(),
  signOff: z.string().max(200).optional(),
  bannedPhrases: z.array(z.string().max(200)).max(50).optional(),
});

export const policiesSchema = z.object({
  shipping: z.string().max(2000).optional(),
  refunds: z.string().max(2000).optional(),
  pricing: z.string().max(2000).optional(),
  hours: z.string().max(500).optional(),
  custom: z
    .array(z.object({ name: z.string().max(200), text: z.string().max(2000) }))
    .max(20)
    .optional(),
});

export const profilePatchSchema = z
  .object({
    identity: identitySchema.optional(),
    voice: voiceSchema.optional(),
    policies: policiesSchema.optional(),
    onboardingStatus: z.enum(["confirmed", "skipped"]).optional(),
  })
  .strict();

export const boundaryInputSchema = z.object({
  ruleText: z.string().min(3).max(500),
  category: z.enum(["never_promise", "never_offer", "handoff", "other"]).default("other"),
  active: z.boolean().default(true),
});
export const boundaryPatchSchema = boundaryInputSchema.partial().strict();

export const knowledgeInputSchema = z.object({
  kind: z.enum(["faq", "product", "document", "scraped"]),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(10000),
});
export const knowledgePatchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    content: z.string().min(1).max(10000).optional(),
    status: z.enum(["confirmed", "rejected"]).optional(),
  })
  .strict();

export const ingestRequestSchema = z.object({ url: z.string().url().max(500) });

/** Strict shape the draft-profile prompt must return. Nothing here can set
 *  confirmed state — persistence forces ai_inferred/suggested. */
export const draftProfileOutputSchema = z.object({
  identity: identitySchema.omit({ url: true }),
  voice: voiceSchema.pick({ tone: true, formality: true }),
  policies: policiesSchema,
  faqs: z
    .array(
      z.object({
        question: z.string().max(300),
        answer: z.string().max(5000),
        sourceUrl: z.string().max(500).optional(),
      }),
    )
    .max(30),
  products: z
    .array(
      z.object({
        name: z.string().max(300),
        description: z.string().max(5000),
        sourceUrl: z.string().max(500).optional(),
      }),
    )
    .max(30),
});

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type DraftProfileOutput = z.infer<typeof draftProfileOutputSchema>;
