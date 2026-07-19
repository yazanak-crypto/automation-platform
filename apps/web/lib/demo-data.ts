// Static showroom data (spec §5: no API calls). A fictional Dubai real-estate
// agency, expressed entirely through Otto's REAL capabilities — website chat +
// email inbox, AI classification, autonomy (auto-handle vs escalate), the run
// ledger. Nothing here implies a feature we don't ship.

export const DEMO = {
  business: "Dar Aliya Properties",
  metrics: [
    { value: "48", label: "handled automatically" },
    { value: "12", label: "leads found" },
    { value: "3", label: "waiting for you" },
    { value: "~5h 20m", label: "time saved this week" },
  ],
  channels: [
    { name: "Website chat", detail: "on daraliya.ae", live: true },
    { name: "Email", detail: "hello@daraliya.ae", live: true },
  ],
  // The auto-play narrative, told through real Otto behavior.
  narrative: [
    {
      k: "arrive",
      channel: "Website chat",
      who: "Visitor · Marina Gate",
      body: "Do you have any 2-bedroom apartments in Dubai Marina under 2.5M?",
      label: "New message",
    },
    {
      k: "read",
      title: "Otto reads and understands",
      body: "Classified: property inquiry · grounded in listings · confidence 0.93",
      label: "Understanding",
    },
    {
      k: "auto",
      title: "Answered automatically",
      body: "Yes — we have three 2BR units in Marina Gate from AED 2.1M. Want me to send floor plans or arrange a viewing this week?",
      label: "Sent · in your voice",
    },
    {
      k: "escalate",
      title: "This one comes to you",
      body: "“The agent promised 2.0M last month and now it’s 2.3M — this is unacceptable.”",
      label: "Escalated · complaint · needs judgment",
    },
    {
      k: "ledger",
      title: "Every action, explained",
      body: "Read message → classified as complaint → no auto-reply → brought to you with reason.",
      label: "Why this happened",
    },
  ],
  // Threads for the interactive inbox mock.
  threads: [
    { who: "Marina Gate visitor", channel: "Website chat", snippet: "2BR in Dubai Marina under 2.5M?", status: "auto", age: "2m" },
    { who: "hello@ · Fatima K.", channel: "Email", snippet: "Viewing availability this weekend?", status: "auto", age: "18m" },
    { who: "Website visitor", channel: "Website chat", snippet: "The price changed since last month…", status: "needs", age: "24m" },
    { who: "hello@ · Omar R.", channel: "Email", snippet: "Is the Downtown penthouse still available?", status: "auto", age: "1h" },
    { who: "Website visitor", channel: "Website chat", snippet: "Can I get a discount if I pay cash?", status: "needs", age: "2h" },
  ],
} as const;
