import { z } from "zod";
import type { AutomationDefinition } from "../types";

// The flagship (Decision 006, upgraded channel-agnostic by Decision 007).
// v1 covers the web-chat channel; email joins in a later M1 step.

export const leadConciergeConfigSchema = z
  .object({
    leadDefinition: z.string().max(1000).optional(),
    hotLeadCriteria: z.string().max(1000).optional(),
    extraInstructions: z.string().max(2000).optional(),
  })
  .strict();

export const leadConcierge: AutomationDefinition = {
  slug: "lead-concierge",
  name: "Lead Concierge",
  category: "Sales",
  tagline: "Never miss a lead — anywhere customers reach you.",
  description:
    "Every message from your website chat is read and understood. Genuine inquiries are detected and qualified, a reply is drafted in your voice using your Business Brain, and nothing is sent until you approve it.",
  tier: "starter",
  version: 1,
  configSchema: leadConciergeConfigSchema,
  definition: {
    howItWorks: [
      "A visitor writes to you through your website chat",
      "AI reads the message and understands what they need",
      "It qualifies the inquiry — intent, urgency, buying signals",
      "A reply is drafted in your voice, using only facts from your Business Brain",
      "You approve, edit, or dismiss — nothing sends without you",
    ],
    requiredCapabilities: ["inbound-messages", "draft-replies"],
    contextNeeds: ["identity", "voice", "policies", "boundaries", "faq_retrieval"],
    configFields: [
      {
        key: "leadDefinition",
        label: "What counts as a lead for you?",
        type: "textarea",
        placeholder: "e.g. Anyone asking about prices, availability, or custom orders",
        help: "Helps the AI tell real inquiries from casual questions.",
      },
      {
        key: "hotLeadCriteria",
        label: "When should a lead be flagged as hot?",
        type: "textarea",
        placeholder: "e.g. Mentions a budget, a deadline, or a competitor",
      },
      {
        key: "extraInstructions",
        label: "Anything else the AI should know?",
        type: "textarea",
        placeholder: "e.g. Always suggest booking a call for project inquiries",
      },
    ],
    sampleMessages: [
      "Hi! Do you have this available, and how fast could you deliver?",
      "What are your prices for a larger order? We'd need it by the end of the month.",
      "Do you ship internationally?",
    ],
    metricsContract: [
      { key: "leadsDetected", label: "Leads detected" },
      { key: "repliesDrafted", label: "Replies drafted" },
      { key: "repliesApproved", label: "Replies sent" },
    ],
    setupMinutes: 5,
  },
};
