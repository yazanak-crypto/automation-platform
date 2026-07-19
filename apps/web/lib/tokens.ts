import { BRAND } from "./brand";

/** Copy tokens for the guided flow (spec: all new copy centralized). */
export const COPY = {
  cta: {
    loggedOut: "See it in action",
    startFree: "Start free",
    midOnboarding: "Continue setup",
    active: "Open dashboard",
    makeYours: "Make this yours →",
  },
  overlay: {
    // Honest microcopy — these describe what actually happens at boot.
    lines: ["opening your workspace…", "checking what needs you…", "counting what Otto handled…"],
  },
  demo: {
    badge: "Interactive demo — fictional business, real product",
    business: "Dar Aliya Properties",
    tagline: `This is ${BRAND} running for a (fictional) Dubai real-estate agency. Watch it work — everything you see is the real product on demo data.`,
    tour: [
      { title: "Messages arrive from your channels", body: "Website chat and email land in one inbox — no tabs, no copy-paste." },
      { title: `${BRAND} reads and understands`, body: "Every message is classified: routine question, real lead, or something that needs you." },
      { title: "Routine gets handled instantly", body: "Grounded answers from your Business Brain go out in seconds — in your voice." },
      { title: "Judgment comes to you", body: "Refunds, negotiations, anger — always escalated with a reason. Never answered blindly." },
      { title: "You see everything", body: "Every action explained, every number real. That's what control feels like." },
    ],
  },
} as const;
