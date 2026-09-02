import type { Metadata } from "next";
import Link from "next/link";
import { conversationsFromCredits, PLANS } from "@platform/core";
import { PlanContactCta } from "@/components/plan-contact-cta";
import { LEGAL, PAYMENTS, TRIAL_DAYS } from "@/lib/legal";
import { PLAN_CONTACT_NOTE } from "@/lib/plan-contact";
import { planContact } from "@/lib/plan-contact.server";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${LEGAL.brand} pricing — ${TRIAL_DAYS}-day free trial, then plans from $${PLANS.entry.priceMonthlyUsd}/month.`,
};

/**
 * Public pricing page.
 *
 * The landing page has a #pricing anchor, but Paddle's verification asks for a
 * pricing URL and an anchor is not one — it cannot be checked independently of
 * the marketing page, and a redesign of the homepage would silently break it.
 * This is a stable, indexable /pricing that states every number a buyer is
 * charged, who charges it, and what happens at the end of the trial.
 *
 * Every figure reads from PLANS, the same constants billing and checkout use,
 * so this page cannot quote a price the card is not charged.
 */

const PAID = [
  { ...PLANS.entry, id: "entry" },
  { ...PLANS.starter, id: "starter" },
  { ...PLANS.growth, id: "growth" },
  { ...PLANS.pro, id: "pro" },
] as const;

export default function PricingPage() {
  const contact = planContact();
  return (
    <article className="space-y-6 text-sm leading-relaxed text-ink-2">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Pricing</h1>
        <p className="mt-1 text-[13px] text-ink-3">All prices in US dollars (USD)</p>
      </div>

      <p>
        Every new workspace starts with a <strong>{TRIAL_DAYS}-day free trial</strong>. No card is
        required to start it, it is offered once per workspace, and it does not renew. When it ends,
        AI features pause until you choose a plan — nothing is charged automatically.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {PAID.map((p) => (
          <section key={p.id} className="rounded-xl border border-line p-5">
            <h2 className="text-base font-semibold text-ink">{p.name}</h2>
            {/* Only Entry carries a setup fee. For the others the monthly price
                IS the whole offer, and quoting a "$0 one-time setup" line would
                invent a charge that does not exist. */}
            {p.setupFeeUsd > 0 ? (
              <>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  ${p.setupFeeUsd}
                  <span className="ml-1 text-[13px] font-normal text-ink-3">one-time setup</span>
                </p>
                <p className="text-[13px] text-ink-2">
                  includes your first month, then{" "}
                  <strong className="text-ink">${p.priceMonthlyUsd}/month</strong> from day 31
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  ${p.priceMonthlyUsd}
                  <span className="ml-1 text-[13px] font-normal text-ink-3">/month</span>
                </p>
                <p className="text-[13px] text-ink-2">no setup fee — billed monthly</p>
              </>
            )}
            <ul className="mt-3 ml-5 list-disc space-y-1 text-[13px]">
              <li>
                About {conversationsFromCredits(p.monthlyCredits).toLocaleString()} customer
                conversations per month
              </li>
              <li>All channels: website chat, email, and WhatsApp</li>
              <li>Cancel anytime from the Billing page</li>
            </ul>
            <PlanContactCta planName={p.name} contact={contact} className="mt-4" />
          </section>
        ))}
      </div>

      {/* Once, below the grid — not per card. Body type and muted ink, the same
          treatment as the "All prices in USD" line: a note, not a warning. */}
      <p className="text-[13px] text-ink-3">{PLAN_CONTACT_NOTE}</p>

      <Section title="What the setup fee covers">
        {PLANS.entry.name} is the only plan with a setup fee. It is charged once, on the day you
        subscribe, and it pays for your first month of service — your recurring monthly charge
        starts on day 31, so you are not billed twice for month one. {PLANS.starter.name},{" "}
        {PLANS.growth.name} and {PLANS.pro.name} have no setup fee and are billed monthly from the
        day you subscribe. Upgrading between plans is available at any time from the Billing page.
      </Section>

      <Section title="Taxes">
        Listed prices exclude VAT and sales tax. {PAYMENTS.provider} calculates and adds any tax due
        for your location at checkout, and shows the total before you pay.
      </Section>

      <Section title="Who you pay">
        {PAYMENTS.provider} ({PAYMENTS.providerEntity}) is the <strong>merchant of record</strong>.
        {" "}
        {PAYMENTS.provider} sells the subscription, takes the payment, issues your receipt and tax
        invoice, and handles tax remittance. Your card statement will show {PAYMENTS.provider}. The
        Service itself is operated by {LEGAL.entity}, {LEGAL.entityForm}.
      </Section>

      <Section title="Cancellations and refunds">
        Cancel at any time from the Billing page; your plan runs to the end of the period you have
        paid for and does not renew. Where a setup fee applies it is fully refundable within 14
        days. Full details
        are in the{" "}
        <Link className="underline" href="/refunds">
          Refund Policy
        </Link>
        .
      </Section>

      <Section title="Questions">
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
          {LEGAL.contactEmail}
        </a>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-base font-semibold text-ink">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
