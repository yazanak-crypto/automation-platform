import { BRAND } from "./brand";

/**
 * Single source of truth for the legal/company details rendered in the policy
 * pages, and for who does what in a transaction.
 *
 * These used to be env vars with placeholder fallbacks ("Ovanth", Delaware,
 * hello@ovanth.com). Nobody set the env vars, so production served a policy
 * naming a US state we have no connection to and an address that does not
 * receive mail. Placeholders that are ALLOWED to ship will ship. The real
 * values are the defaults now; the env overrides remain for staging.
 *
 * Paddle verifies these pages before approving a live account, so anything
 * inaccurate here is both a legal problem and a launch blocker.
 */

/** Free trial length, in days. Matches the trial granted at signup. */
export const TRIAL_DAYS = 7;

export const LEGAL = {
  brand: BRAND,

  /** Registered legal entity that operates the Service. */
  entity:
    process.env.NEXT_PUBLIC_LEGAL_ENTITY ??
    "Abdel Khalek Trading Establishment for Tires",
  /** Legal form, stated so the entity's nature is not left to inference. */
  entityForm: "a sole establishment registered in Lebanon",
  /** Commercial registration number. */
  registrationNumber: "3100119",
  /** Registered address. */
  address: "Majdal Anjar, Zahle, Bekaa, Lebanon",

  /** Support/legal contact. Routed via Cloudflare Email Routing. */
  contactEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@ovanth.com",
  /**
   * Privacy contact. Deliberately the SAME mailbox: a distinct privacy@ address
   * that nobody routes is worse than one that is monitored, because a data
   * subject request would bounce silently and the 30-day clock would still run.
   */
  privacyEmail:
    process.env.NEXT_PUBLIC_PRIVACY_EMAIL ??
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??
    "support@ovanth.com",

  /** Governing law / jurisdiction for the Terms. */
  governingLaw: process.env.NEXT_PUBLIC_GOVERNING_LAW ?? "Lebanon",

  /** Shown as "Last updated". */
  lastUpdated: process.env.NEXT_PUBLIC_LEGAL_UPDATED ?? "2026-08-21",
} as const;

/**
 * The payment provider, and — importantly — its ROLE.
 *
 * Paddle is the merchant of record. That is not a billing detail, it changes
 * who the customer's contract for payment is with: Paddle sells the
 * subscription to the customer, collects the money, and is responsible for VAT
 * and sales tax. We supply the software. Describing ourselves as the seller
 * would misstate the transaction and contradict the receipt the customer gets.
 */
export const PAYMENTS = {
  provider: "Paddle",
  /** Paddle's contracting entity for merchant-of-record sales. */
  providerEntity: "Paddle.com Market Ltd",
  providerTermsUrl: "https://www.paddle.com/legal/terms",
  providerPrivacyUrl: "https://www.paddle.com/legal/privacy",
} as const;

// The real third parties that process customer data — disclosed in the policy.
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: "Clerk", purpose: "Authentication and account management" },
  { name: "Neon (PostgreSQL)", purpose: "Primary database hosting" },
  { name: "Railway (Redis)", purpose: "Queues, rate limiting, and caching" },
  { name: "Vercel", purpose: "Application hosting and delivery" },
  { name: "Anthropic", purpose: "AI model that drafts replies" },
  // Was "Stripe — payment processing". Paddle is not merely a processor here:
  // it is the merchant of record and the seller to the customer.
  { name: "Paddle", purpose: "Merchant of record — payments, billing, and tax" },
  { name: "Nango", purpose: "Secure OAuth vault for connected accounts" },
  { name: "Meta Platforms", purpose: "WhatsApp / Instagram / Messenger message delivery" },
  { name: "Google", purpose: "Gmail message access (when connected)" },
  { name: "Resend", purpose: "Transactional email delivery" },
  { name: "Sentry", purpose: "Error monitoring (when enabled)" },
];
