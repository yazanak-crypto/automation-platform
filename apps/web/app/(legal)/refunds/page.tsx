import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-ink-2">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Refund &amp; Cancellation Policy</h1>
        <p className="mt-1 text-[13px] text-ink-3">Last updated {LEGAL.lastUpdated}</p>
      </div>

      <Section title="Free trial">
        Every account starts with a time-limited free trial. You are not charged during the trial, and
        no payment method is required to start it.
      </Section>

      <Section title="Cancellation">
        You can cancel your subscription at any time from the Billing page. When you cancel, your plan
        remains active until the end of the current billing period, after which it will not renew and
        no further charges are made. Your data stays available while your account is open.
      </Section>

      <Section title="Setup fee">
        Some plans include a one-time setup fee that covers your first month of service. Because it
        pays for the first active month, the setup fee is non-refundable once your workspace has been
        provisioned, except where required by law.
      </Section>

      <Section title="Monthly fees">
        Recurring subscription fees are billed in advance for each period and are generally
        non-refundable for partial periods. If you were charged in error, or experienced a material
        failure of the Service, contact us within 14 days and we will review the charge in good faith
        and issue a refund where appropriate.
      </Section>

      <Section title="Failed payments">
        If a renewal payment fails, your subscription is marked past-due and AI features may pause until
        payment succeeds. Your data is retained during this period.
      </Section>

      <Section title="How to request a refund">
        Email{" "}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> from
        your account email with the charge details. We respond within 5 business days.
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
