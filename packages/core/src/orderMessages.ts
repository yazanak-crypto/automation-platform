// Customer-facing order copy. FIXED FRAMES, never model-generated.
//
// A generated acknowledgement is one prompt regression away from confirming a
// price or a delivery time nobody agreed to. The frames below state that
// something was received and that a human will decide — nothing more. Only the
// business name and the item summary are substituted, and the summary is
// rendered from rows that have already been committed.

export type AckLanguage = "ar" | "en";

/**
 * Which frame to use.
 *
 * Keyed off the CUSTOMER's message, not the business's language list alone. A
 * business serving both Arabic and English has no single right answer at the
 * workspace level — the person who just wrote in does. A message opening in
 * Arabic gets the Arabic frame; "Hi, 2 pizzas please" does not, even from the
 * same customer.
 *
 * The direction is passed IN rather than computed here. `fieldDirection` lives
 * in @platform/brain, and brain depends on core — importing it back would close
 * a dependency cycle. The worker composes the two, which also keeps this module
 * pure and trivially testable.
 *
 * The business's own languages still gate it: a business that never replies in
 * Arabic should not suddenly start, however the customer wrote.
 */
export function pickAckLanguage(input: {
  businessLanguages?: readonly string[] | null;
  /** From fieldDirection() on the customer message, at the call site. */
  customerMessageIsRtl?: boolean;
}): AckLanguage {
  const speaksArabic = (input.businessLanguages ?? []).some(
    (l) => typeof l === "string" && l.trim().toLowerCase() === "arabic",
  );
  if (!speaksArabic) return "en";
  return input.customerMessageIsRtl ? "ar" : "en";
}

/**
 * The acknowledgement sent the moment an order is captured.
 *
 * Says received, not agreed. No price, no time commitment, no "confirmed" —
 * the whole point is that the owner decides next.
 */
export function renderAcknowledgement(input: {
  summary: string;
  businessName: string;
  language: AckLanguage;
}): string {
  const { summary, businessName } = input;
  if (input.language === "ar") {
    // "Received: <items>. <business> will confirm with you shortly."
    // Item names are inserted verbatim; a Latin-script dish inside an Arabic
    // sentence is normal here and the messaging client applies bidi itself.
    return `تم استلام طلبك: ${summary}. سيؤكده لك ${businessName} قريبًا.`;
  }
  return `Noted: ${summary}. ${businessName} will confirm shortly.`;
}

/**
 * Default text for the owner's confirmation message.
 *
 * A STARTING POINT, not a send. The owner sees this in the Orders tab and can
 * edit it before it goes out (PR 4) — these messages are the ones that actually
 * commit the business, so they never fire blind.
 */
export function renderConfirmation(input: {
  summary: string;
  businessName: string;
  language: AckLanguage;
}): string {
  if (input.language === "ar") {
    return `تم تأكيد طلبك: ${input.summary}. شكرًا لك!`;
  }
  return `Your order is confirmed: ${input.summary}. Thank you!`;
}

/** Default text for a cancellation. Neutral on purpose — no reason invented. */
export function renderCancellation(input: {
  summary: string;
  businessName: string;
  language: AckLanguage;
}): string {
  if (input.language === "ar") {
    return `نعتذر، لم نتمكن من تأكيد طلبك: ${input.summary}. يرجى التواصل معنا إذا كان لديك أي استفسار.`;
  }
  return `Sorry — we couldn't confirm your order: ${input.summary}. Please get in touch if you'd like to discuss it.`;
}
