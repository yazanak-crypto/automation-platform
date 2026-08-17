import type { Question } from "./types";

// Asked of every business, before the vertical-specific set.
// Six questions. Everything here is something the AI needs for almost any
// reply; anything only some businesses need belongs in a vertical file.

export const CORE_QUESTIONS: readonly Question[] = [
  {
    id: "what_you_do",
    factLabel: "What the business does",
    label: "What do you do, in one sentence?",
    help: "How you'd explain it to someone at a party.",
    input: "long_text",
    placeholder: "We deliver fresh Lebanese mezze across Beirut, made same-day.",
    important: true,
    prefillFrom: "identity.description",
  },
  {
    id: "hours",
    factLabel: "Opening hours",
    label: "When are you open?",
    help: "Your AI uses this to answer \"are you open now?\" without guessing.",
    input: "weekly_hours",
    important: true,
    prefillFrom: "policies.hours",
  },
  {
    id: "languages",
    factLabel: "Languages replies should use",
    label: "Which languages should replies be written in?",
    input: "chips",
    options: ["Arabic", "English", "French", "Armenian"],
    allowCustom: true,
    prefillFrom: "voice.languages",
  },
  {
    id: "tone",
    factLabel: "Tone of replies",
    label: "How should your replies sound?",
    input: "single_select",
    options: ["Warm and friendly", "Professional", "Short and direct", "Playful"],
    prefillFrom: "voice.tone",
  },
  {
    id: "payment_methods",
    factLabel: "Accepted payment methods",
    label: "How can customers pay?",
    input: "chips",
    options: [
      "Cash",
      "Visa / Mastercard",
      "Bank transfer",
      "Whish",
      "OMT",
      "Cash on delivery",
    ],
    allowCustom: true,
  },
  {
    id: "never_do",
    label: "What should your AI never do?",
    help:
      "The most important answer here. Anything you pick is a hard rule — it will bring those to you instead of answering.",
    input: "chips_plus_text",
    options: [
      "Give discounts",
      "Quote prices",
      "Promise delivery dates",
      "Give medical or legal advice",
      "Accept returns or refunds",
      "Agree to custom work",
      "Share stock levels",
      "Negotiate",
    ],
    allowCustom: true,
    placeholder: "Anything else it must never say or promise…",
    important: true,
  },
];
