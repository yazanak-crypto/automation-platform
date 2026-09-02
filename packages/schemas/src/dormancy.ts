import { z } from "zod";

// How long a business-side obligation may sit before it is called dormant.
//
// These are OBLIGATIONS, not cold leads. Every source is something the business
// owes a response on: a draft it queued, an order it has not decided, a customer
// it told a human would follow up. Conversations that simply went quiet are
// deliberately excluded — most end because the customer was served, and folding
// them in turns this into a list nobody reads.

/**
 * Lives under `workspaces.autonomySettings.dormancy`, beside `orders`.
 *
 * Deliberately NOT a sibling of maxAutoRisk/categoryOverrides in meaning: those
 * govern a per-message DECISION, this is a workspace operating preference. It
 * shares the jsonb column because that is where workspace settings live, and
 * because it needs no migration to add.
 */
export const dormancySettingsSchema = z
  .object({
    /**
     * Hours before a queued draft is dormant.
     *
     * 24h is one business day, and it is also under WhatsApp's 24-hour customer
     * service window — past that the business cannot reply freely at all, only
     * with a pre-approved template. That window is the real deadline, which is
     * why these are not round numbers chosen by taste.
     */
    draftHours: z.number().int().min(1).max(720).default(24),
    /** Orders are the most time-sensitive: a customer is waiting on a yes/no. */
    orderHours: z.number().int().min(1).max(720).default(12),
    /** The AI promised a human would follow up. One business day to keep it. */
    escalationHours: z.number().int().min(1).max(720).default(24),
  })
  .strict();

export type DormancySettings = z.infer<typeof dormancySettingsSchema>;

export const DEFAULT_DORMANCY_SETTINGS: DormancySettings = {
  draftHours: 24,
  orderHours: 12,
  escalationHours: 24,
};
