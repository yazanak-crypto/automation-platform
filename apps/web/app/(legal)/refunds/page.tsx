import type { Metadata } from "next";
import { PLANS } from "@platform/core";
import { LEGAL, PAYMENTS, TRIAL_DAYS } from "@/lib/legal";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-ink-2">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Refund &amp; Cancellation Policy</h1>
        <p className="mt-1 text-[13px] text-ink-3">Last updated {LEGAL.lastUpdated}</p>
      </div>

      <p>
        This policy applies to subscriptions to the {LEGAL.brand} platform, operated by{" "}
        {LEGAL.entity}, {LEGAL.entityForm} (commercial registration {LEGAL.registrationNumber}),{" "}
        {LEGAL.address}.
      </p>

      <Section title="Who you are buying from">
        {PAYMENTS.provider} ({PAYMENTS.providerEntity}) is the <strong>merchant of record</strong> for
        all purchases. {PAYMENTS.provider} sells the subscription to you, takes the payment, issues the
        receipt, and handles VAT and sales tax. Refunds are therefore processed by{" "}
        {PAYMENTS.provider}, to the original payment method. You can request one from us or from{" "}
        {PAYMENTS.provider} directly; either way we authorise it and {PAYMENTS.provider} pays it out.
      </Section>

      <Section title="Free trial">
        Every new workspace gets a {TRIAL_DAYS}-day free trial. No payment method is required to start
        it and no charge is made during it. The trial is offered <strong>once per workspace</strong>{" "}
        and does not renew.
      </Section>

      <Section title="What you are charged">
        <ul className="ml-5 list-disc space-y-1">
          {(["entry", "starter", "growth", "pro"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <li key={id}>
                <strong>{p.name}</strong> —{" "}
                {p.setupFeeUsd > 0
                  ? `$${p.setupFeeUsd} one-time setup fee covering your first month, then $${p.priceMonthlyUsd} per month from day 31.`
                  : `$${p.priceMonthlyUsd} per month, with no setup fee.`}
              </li>
            );
          })}
        </ul>
        <p className="mt-2">
          Prices are in US dollars and exclude VAT or sales tax, which {PAYMENTS.provider} adds where
          your location requires it.
        </p>
      </Section>

      <Section title="14-day refund on the setup fee">
        {/* A blanket "non-refundable setup fee" on a first charge is the single
            most likely reason a Paddle application is rejected, and it is the
            term most likely to produce chargebacks later. A bounded window is
            both fairer and cheaper than disputes. */}
        {PLANS.entry.name} is the only plan with a setup fee; on every other plan there is nothing
        to refund here and the Monthly fees section below applies instead. If you are not satisfied,
        you may request a full refund of the setup fee within{" "}
        <strong>14 days</strong> of the charge. We refund in full within that window, no reason
        required. After 14 days the setup fee is non-refundable, because it covers a month of service
        that has been delivered — except where consumer law in your country grants you a longer right,
        which we will honour.
      </Section>

      <Section title="Monthly fees">
        Recurring fees are billed in advance for each month. If you cancel, your plan stays active
        until the end of the period you have paid for and is not renewed; we do not pro-rate partial
        months. If you were charged in error, charged after cancelling, or the Service suffered a
        material failure, contact us within 30 days and we will refund the affected period.
      </Section>

      <Section title="Cancellation">
        You can cancel at any time from the Billing page in your account — no email or phone call
        required. Cancelling stops future charges immediately; access continues to the end of the paid
        period. Your data stays available while your account is open.
      </Section>

      <Section title="Failed payments">
        If a renewal payment fails, {PAYMENTS.provider} retries it and your subscription is marked
        past-due. AI features may pause until payment succeeds. Your data is retained during this
        period and nothing is deleted because of a failed payment.
      </Section>

      <Section title="How to request a refund">
        Email{" "}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
          {LEGAL.contactEmail}
        </a>{" "}
        from your account email address with the charge date and amount. We respond within{" "}
        <strong>2 business days</strong> and, where a refund is due, authorise it with{" "}
        {PAYMENTS.provider} immediately. {PAYMENTS.provider} then returns the money to your original
        payment method, which typically takes 5–10 business days depending on your bank.
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
