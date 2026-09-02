import { aiConfigured, callAi } from "@platform/ai";
import { conversationsFromCredits, getCreditStatus, PLANS, takeLimit } from "@platform/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

// In-product AI support assistant. Runs entirely server-side (the AI key never
// leaves the server) and falls back to canned answers when AI is unavailable.

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .min(1)
    .max(12),
});

const KNOWLEDGE = `You are the in-app support assistant for ${BRAND}, an AI that handles customer
conversations for small businesses. Answer ONLY about ${BRAND}; be concise, warm, and concrete.
If you don't know, say so and suggest emailing support. Never invent features.

How it works:
- ${BRAND} learns a business from its website (the "Business Brain": voice, policies, FAQs, boundaries).
- It reads incoming customer messages, and either answers routine ones or brings judgment calls to the owner.
- It starts in Supervised mode (every reply waits for approval) and earns Smart mode (routine questions answered automatically) as the owner approves its work.

Onboarding: sign up → confirm what ${BRAND} learned from your site → connect a channel → activate an automation.

Activating an automation: go to Automations (the marketplace) → pick one (e.g. Lead Concierge) → Connect a channel → Configure → Preview on a sample message → Go live. It starts Supervised; you approve every draft until you trust it.

Channels: Website chat, Email (Gmail), and WhatsApp work today. Add website chat on the Channels page by pasting a snippet on your site; connect Gmail or WhatsApp via the Channels page. Instagram, Messenger, SMS, and more are on the roadmap.

Autonomy: low-risk, well-grounded questions can be answered automatically in Smart mode; refunds, complaints, negotiations, and anything unclear always come to the owner. Boundaries (e.g. "never offer discounts") are always respected.

Billing: a one-time 7-day free trial (no card), which never renews. Then ${PLANS.entry.name} — a one-time $${PLANS.entry.setupFeeUsd} setup fee that covers the first month, then $${PLANS.entry.priceMonthlyUsd}/month from day 31 (about ${conversationsFromCredits(PLANS.entry.monthlyCredits)} conversations); ${PLANS.starter.name} — $${PLANS.starter.priceMonthlyUsd}/month, no setup fee (about ${conversationsFromCredits(PLANS.starter.monthlyCredits)}); ${PLANS.growth.name} — $${PLANS.growth.priceMonthlyUsd}/month (about ${conversationsFromCredits(PLANS.growth.monthlyCredits)}); ${PLANS.pro.name} — $${PLANS.pro.priceMonthlyUsd}/month (about ${conversationsFromCredits(PLANS.pro.monthlyCredits)}). Only ${PLANS.entry.name} has a setup fee, and it includes the first month. Card payments are coming soon — we are not taking card payments yet. For now we set the account up personally and invoice directly, by bank transfer or Whish: open the Billing page and use the WhatsApp or email button on the plan you want, or see the bank details at /checkout. Never tell a customer they can pay by card today. Refunds: where a setup fee applies it is fully refundable within 14 days; see the Refund Policy at /refunds.

Account: the avatar menu (bottom-left) has Account settings, Billing, Manage profile, and Sign out.`;

function fallback(question: string): string {
  const q = question.toLowerCase();
  if (/bill|price|pay|charge|refund|credit|cancel|subscri|upgrade/.test(q))
    return `Billing lives on the Billing page. You get a one-time 7-day free trial (no card). ${PLANS.entry.name} is a $${PLANS.entry.setupFeeUsd} one-time setup fee covering your first month, then $${PLANS.entry.priceMonthlyUsd}/month; ${PLANS.starter.name} is $${PLANS.starter.priceMonthlyUsd}/month, ${PLANS.growth.name} $${PLANS.growth.priceMonthlyUsd}/month and ${PLANS.pro.name} $${PLANS.pro.priceMonthlyUsd}/month, all with no setup fee. Card payments are not live yet — pick a plan on the Billing page and message us on WhatsApp or by email, and we will set you up and invoice you by bank transfer or Whish.`;
  if (/activate|automation|marketplace|lead|concierge/.test(q))
    return `To activate an automation: open Automations, pick one, connect a channel, configure it, preview it on a sample message, then go live. It starts in Supervised mode so you approve every reply until you trust it.`;
  if (/channel|website|chat|widget|email|gmail|whatsapp|instagram|integrat/.test(q))
    return `Website chat and Email (Gmail) work today — set them up on the Channels page (paste a snippet for website chat, or connect Gmail). More channels like WhatsApp and Instagram are on the roadmap.`;
  if (/brain|knowledge|voice|policy|boundar|onboard/.test(q))
    return `Your Business Brain is what ${BRAND} knows about your business — voice, policies, FAQs, and boundaries. Edit it on the Business Brain page; confirm suggestions before ${BRAND} uses them.`;
  if (/account|profile|password|sign|logout|setting/.test(q))
    return `Open the avatar menu at the bottom-left for Account settings, Billing, Manage profile, and Sign out.`;
  return `I can help with how ${BRAND} works, activating automations, connecting channels, billing, and account settings. Ask me anything — or email ${LEGAL.contactEmail} for a human.`;
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const last = parsed.data.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";

  // Credit gate alongside the rate limit: an exhausted workspace still gets a
  // helpful canned answer, but never spends AI budget.
  const credits = await getCreditStatus(ctx.workspace.id);
  if (
    !aiConfigured() ||
    credits.exhausted ||
    !(await takeLimit(`support:${ctx.workspace.id}`, 40, 3600))
  ) {
    return NextResponse.json({ reply: fallback(last), source: "fallback" });
  }

  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  try {
    const res = await callAi({
      workspaceId: ctx.workspace.id,
      promptRef: "support/assistant",
      promptVersion: "v1",
      tier: "fast",
      system: KNOWLEDGE,
      prompt: `${transcript}\n\nAssistant:`,
      maxTokens: 400,
    });
    const reply = res.text.trim();
    return NextResponse.json({ reply: reply || fallback(last), source: "ai" });
  } catch {
    return NextResponse.json({ reply: fallback(last), source: "fallback" });
  }
}
