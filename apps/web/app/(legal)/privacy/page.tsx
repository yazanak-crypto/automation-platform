import type { Metadata } from "next";
import { LEGAL, PAYMENTS, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-ink-2">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Privacy Policy</h1>
        <p className="mt-1 text-[13px] text-ink-3">Last updated {LEGAL.lastUpdated}</p>
      </div>

      <p>
        This Privacy Policy explains how {LEGAL.entity} (“{LEGAL.brand}”, “we”, “us”) —{" "}
        {LEGAL.entityForm}, commercial registration {LEGAL.registrationNumber}, registered at{" "}
        {LEGAL.address} — collects, uses, and protects information when you use our AI
        customer-conversation platform (the “Service”). By using the Service you agree to this policy.
      </p>

      <Section title="Who controls your data">
        For your account and business data, {LEGAL.brand} acts as the data controller. For the
        content of conversations your business handles through the Service (messages from your
        customers), {LEGAL.brand} acts as a data processor on your behalf — you are the controller and
        remain responsible for your lawful basis to process your customers’ data.
      </Section>

      <Section title="Information we collect">
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Account data:</strong> your name, email, and login, managed by our authentication provider.</li>
          <li><strong>Business Brain:</strong> the business details, voice, policies, and FAQs you provide or that we extract from a website you give us.</li>
          <li><strong>Conversations:</strong> messages exchanged with your customers on channels you connect (website chat, email, Instagram), and AI-drafted replies.</li>
          <li><strong>Connected accounts:</strong> we store a reference to your connected accounts and a display label. We never store the passwords or OAuth tokens for those accounts — they are held by our OAuth vault provider.</li>
          <li><strong>Billing data:</strong> your plan, subscription status, and the identifiers {PAYMENTS.provider} gives us for your customer and subscription. {PAYMENTS.provider} is the merchant of record and collects your payment and billing details directly — card numbers and billing addresses are never sent to us, and we never see or store them. {PAYMENTS.provider} is an independent controller for the payment data it collects; see its <a className="underline" href={PAYMENTS.providerPrivacyUrl} target="_blank" rel="noreferrer">privacy notice</a>.</li>
          <li><strong>Usage and diagnostics:</strong> logs, IP address (for rate limiting and abuse prevention), and error reports.</li>
        </ul>
      </Section>

      <Section title="How we use information">
        We use information to provide and operate the Service, draft and deliver replies, learn your
        business voice, prevent abuse, process payments, provide support, and comply with law. AI
        replies are grounded in your Business Brain; we do not use your conversation content to train
        third-party foundation models.
      </Section>

      <Section title="Legal bases (EEA/UK)">
        We process personal data to perform our contract with you, for our legitimate interests
        (securing and improving the Service), to comply with legal obligations, and with consent where
        required.
      </Section>

      <Section title="Sub-processors">
        We share data with the following processors only as needed to run the Service:
        <ul className="ml-5 mt-2 list-disc space-y-1">
          {SUBPROCESSORS.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> — {s.purpose}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Cookies">
        We use strictly necessary cookies for authentication and security (set by our auth provider)
        and to keep you signed in. We do not use advertising cookies. Because these cookies are
        essential to provide the Service you requested, they are used on that basis; you can block
        cookies in your browser, but the Service may not function without them.
      </Section>

      <Section title="Data retention">
        We retain account and conversation data for as long as your workspace is active. When you
        close your account, we delete or anonymize your data within 30 days, except where we must
        retain records to comply with legal, tax, or accounting obligations.
      </Section>

      <Section title="Your rights">
        Depending on your location, you may have the right to access, correct, export, or delete your
        personal data, and to object to or restrict certain processing. You can export your workspace
        data from Settings → Data, and request deletion by emailing{" "}
        <a className="underline" href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>. We
        will respond within 30 days.
      </Section>

      <Section title="Security">
        Data is encrypted in transit (TLS) and at rest by our infrastructure providers. Access is
        restricted, and credentials for connected accounts are held in a dedicated OAuth vault, not in
        our database.
      </Section>

      <Section title="International transfers">
        Your data may be processed in countries other than your own, including the United States and
        the EU. Where required, we rely on appropriate safeguards such as Standard Contractual Clauses.
      </Section>

      <Section title="Children">
        The Service is for businesses and is not directed to children under 16. We do not knowingly
        collect their data.
      </Section>

      <Section title="Changes">
        We may update this policy; material changes will be posted here with a new “Last updated” date.
      </Section>

      <Section title="Contact">
        {LEGAL.entity}
        <br />
        {LEGAL.address}
        <br />
        Questions or requests:{" "}
        <a className="underline" href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
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
