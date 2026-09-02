import { planContactLinks, type PlanContact } from "@/lib/plan-contact";

/**
 * The CTA pair on a plan card: WhatsApp primary, email secondary.
 *
 * Presentational and prop-driven so the same markup serves the marketing pages
 * (server components) and the in-app billing page (a client component) — the
 * alternative was three copies of a wa.me URL drifting apart.
 *
 * When WHATSAPP_NUMBER is unset the WhatsApp button is omitted and email is
 * promoted to primary, rather than rendering a link to wa.me/ with no number.
 */
export function PlanContactCta({
  planName,
  contact,
  className = "",
}: {
  planName: string;
  contact: PlanContact;
  className?: string;
}) {
  const links = planContactLinks(planName, contact);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {links.whatsapp ? (
        <>
          <a
            href={links.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="press-glow block w-full rounded-lg bg-white py-2 text-center text-sm font-medium text-black transition-transform active:scale-[0.97]"
          >
            Talk to us on WhatsApp
          </a>
          <a
            href={links.email}
            className="block w-full text-center text-[13px] text-ink-3 underline underline-offset-4 transition-colors hover:text-ink-2"
          >
            or email us
          </a>
        </>
      ) : (
        <a
          href={links.email}
          className="press-glow block w-full rounded-lg bg-white py-2 text-center text-sm font-medium text-black transition-transform active:scale-[0.97]"
        >
          Email us
        </a>
      )}
    </div>
  );
}
