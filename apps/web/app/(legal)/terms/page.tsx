import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-ink-2">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Terms of Service</h1>
        <p className="mt-1 text-[13px] text-ink-3">Last updated {LEGAL.lastUpdated}</p>
      </div>

      <p>
        These Terms govern your use of the {LEGAL.brand} platform provided by {LEGAL.entity}. By
        creating an account or using the Service, you agree to these Terms.
      </p>

      <Section title="1. The Service">
        {LEGAL.brand} is an AI platform that learns your business and drafts or sends replies to your
        customers across channels you connect. While your AI is in supervised mode, replies wait for
        your approval. You are responsible for reviewing AI output and for the messages sent from your
        connected accounts.
      </Section>

      <Section title="2. Accounts">
        You must provide accurate information and keep your credentials secure. You are responsible for
        activity under your workspace, including that of teammates you invite. You must be authorized to
        connect any account (email, Instagram, website) you link to the Service.
      </Section>

      <Section title="3. Acceptable use">
        You may not use the Service to send spam or unlawful, deceptive, harassing, or infringing
        content; to violate the terms of a connected platform (e.g., Meta or Google policies); to
        attempt to breach security or access another customer’s data; or to build a competing dataset
        from the Service. We may suspend accounts that violate these Terms.
      </Section>

      <Section title="4. AI output">
        AI-drafted replies are generated from the information you provide and may contain errors. The
        Service is a tool, not professional advice. You are responsible for approving and sending
        replies; supervised mode is provided so you can review before anything is sent.
      </Section>

      <Section title="5. Fees and billing">
        Paid plans are billed as described on the Billing page. Some plans include a one-time setup fee
        that covers your first month; recurring charges begin after that period. Plans include a monthly
        allowance of AI usage; if you exhaust it, AI drafting pauses until the next period or an upgrade,
        and your data remains available. Fees are exclusive of taxes where applicable. See our Refund
        Policy for cancellations and refunds.
      </Section>

      <Section title="6. Free trial">
        We may offer a time-limited free trial. At the end of the trial, AI features pause unless you
        select a paid plan. No charge is made without a plan you choose.
      </Section>

      <Section title="7. Your data">
        You retain ownership of your business data and customer conversations. You grant us a limited
        license to process it solely to provide the Service. Our handling of personal data is described
        in the Privacy Policy.
      </Section>

      <Section title="8. Third-party services">
        The Service integrates with third parties (e.g., Meta, Google, Stripe). Your use of those
        integrations is also subject to their terms, and we are not responsible for their availability
        or actions.
      </Section>

      <Section title="9. Warranty disclaimer">
        The Service is provided “as is” and “as available”, without warranties of any kind to the
        maximum extent permitted by law. We do not warrant that the Service will be uninterrupted,
        error-free, or that AI output will be accurate.
      </Section>

      <Section title="10. Limitation of liability">
        To the maximum extent permitted by law, {LEGAL.brand} will not be liable for indirect,
        incidental, or consequential damages, and our total liability for any claim will not exceed the
        amount you paid us in the 12 months before the claim.
      </Section>

      <Section title="11. Termination">
        You may cancel at any time from the Billing page. We may suspend or terminate accounts that
        violate these Terms. On termination, your right to use the Service ends; data handling follows
        the Privacy Policy.
      </Section>

      <Section title="12. Changes">
        We may update these Terms; material changes will be posted here with a new date. Continued use
        after changes constitutes acceptance.
      </Section>

      <Section title="13. Governing law">
        These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to conflict-of-law
        rules.
      </Section>

      <Section title="14. Contact">
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
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
