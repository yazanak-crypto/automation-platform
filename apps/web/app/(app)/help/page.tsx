import Link from "next/link";
import { Page, PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

const CARDS = [
  { title: "Getting started", body: `Set up your Business Brain, connect a channel, and put ${BRAND} on duty.`, href: "/dashboard" },
  { title: "How autonomy works", body: "Supervised vs Smart mode, and how Ovanth earns its autonomy.", href: "/marketplace" },
  { title: "Your Business Brain", body: "Teach Ovanth your voice, policies, and boundaries.", href: "/brain" },
  { title: "Billing & plans", body: "Trials, plans, and upgrades.", href: "/billing" },
];

export default function HelpPage() {
  return (
    <Page>
      <PageHeader title="Help" subtitle={`Everything you need to get the most out of ${BRAND}.`} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            prefetch
            className="lit block rounded-[10px] border border-line bg-raised p-4 transition-colors hover:border-line-strong"
          >
            <p className="text-sm font-medium">{c.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{c.body}</p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-[13px] text-ink-2">
        Need a hand? Email{" "}
        <a href={`mailto:${LEGAL.contactEmail}`} className="text-brass underline underline-offset-4">
          {LEGAL.contactEmail}
        </a>{" "}
        and a human will get back to you.
      </p>
    </Page>
  );
}
