import { BRAND } from "./brand";

// Single source of truth for legal/company details rendered in the policy pages.
// Values a human must confirm before launch come from env with safe defaults —
// set these in production so the policies name your real entity and contact.
export const LEGAL = {
  brand: BRAND,
  /** Registered legal entity, e.g. "Ovanth, Inc.". */
  entity: process.env.NEXT_PUBLIC_LEGAL_ENTITY ?? `${BRAND}`,
  /** Support/legal contact. */
  contactEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@ovanth.ai",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "privacy@ovanth.ai",
  /** Governing law / jurisdiction for the Terms. */
  governingLaw: process.env.NEXT_PUBLIC_GOVERNING_LAW ?? "the State of Delaware, USA",
  /** Shown as "Last updated". Set at deploy or leave to the build date. */
  lastUpdated: process.env.NEXT_PUBLIC_LEGAL_UPDATED ?? "2026-07-23",
} as const;

// The real third parties that process customer data — disclosed in the policy.
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: "Clerk", purpose: "Authentication and account management" },
  { name: "Neon (PostgreSQL)", purpose: "Primary database hosting" },
  { name: "Upstash (Redis)", purpose: "Queues, rate limiting, and caching" },
  { name: "Anthropic", purpose: "AI model that drafts replies" },
  { name: "Stripe", purpose: "Payment processing and billing" },
  { name: "Nango", purpose: "Secure OAuth vault for connected accounts" },
  { name: "Meta Platforms", purpose: "Instagram / Messenger message delivery" },
  { name: "Google", purpose: "Gmail message access (when connected)" },
  { name: "Resend", purpose: "Transactional email delivery" },
  { name: "Sentry", purpose: "Error monitoring (when enabled)" },
];
