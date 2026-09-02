/**
 * The contact route a visitor takes INSTEAD of a card checkout.
 *
 * Paddle merchant verification is not complete, so no checkout can finish. A
 * button that opens a checkout which cannot complete is worse than no button:
 * it spends the one moment someone decided to buy. Until Paddle is live, every
 * plan CTA points at a human.
 *
 * ONE source for both handles, used by /pricing, the landing grid and the
 * in-app /billing cards:
 *   • WhatsApp — WHATSAPP_NUMBER, the same env var /checkout already reads
 *     through paymentDetails(). Not duplicated per component.
 *   • Email    — LEGAL.contactEmail (NEXT_PUBLIC_SUPPORT_EMAIL), already the
 *     address on /pricing, /help and /checkout.
 *
 * ⚠️ This file must stay CLIENT-SAFE — /billing is a client component. Reading
 * the env vars lives in ./plan-contact.server.ts, because @platform/core pulls
 * in bullmq and drags `child_process` into the browser bundle. The client
 * receives the resolved values as props (from the /api/billing response).
 */
export interface PlanContact {
  /** Digits only, ready for a wa.me path. Empty when WHATSAPP_NUMBER is unset. */
  whatsappDigits: string;
  email: string;
}

/**
 * The two hrefs for one plan card.
 *
 * The plan name rides in both the WhatsApp prefill and the mail subject so the
 * first message already says which plan — the conversation starts at "let's set
 * you up" rather than "which plan did you want?".
 */
export function planContactLinks(planName: string, contact: PlanContact) {
  const text = `Hi, I'm interested in the ${planName} plan`;
  return {
    whatsapp: contact.whatsappDigits
      ? `https://wa.me/${contact.whatsappDigits}?text=${encodeURIComponent(text)}`
      : null,
    email: `mailto:${contact.email}?subject=${encodeURIComponent(`${planName} plan enquiry`)}`,
  };
}

/**
 * Shown ONCE below a plan grid, never per card. States plainly why there is no
 * card button, so "no checkout" reads as a stage the product is at rather than
 * something broken.
 */
export const PLAN_CONTACT_NOTE =
  "Card payments are coming soon. For now, we set up your account personally and invoice you directly — bank transfer or Whish.";
