import Link from "next/link";
import { Page, PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";

// Settings hub. Live sections link to where the feature already lives; the rest
// are honestly marked "coming soon" — a real roadmap, not fake toggles.
const SECTIONS: { label: string; body: string; href?: string }[] = [
  { label: "Business Brain", body: "Your voice, policies, FAQs, and boundaries.", href: "/brain" },
  { label: "Channels", body: "Website chat, email, and more.", href: "/channels" },
  { label: "Billing", body: "Plan, usage, and invoices.", href: "/billing" },
  { label: "Workspace", body: "Your business name and workspace details.", href: "/settings/workspace" },
  { label: "Notifications", body: "Get an email when a reply needs your approval.", href: "/settings/notifications" },
  { label: "Security", body: "Password, two-factor, and active sessions.", href: "/settings/security" },
  { label: "Integrations", body: "Website chat, email, Instagram, and more.", href: "/channels" },
  { label: "Audit Log", body: "A record of every important change.", href: "/settings/audit" },
  { label: "Data & Danger Zone", body: "Export your data or close your workspace.", href: "/settings/danger" },
  { label: "Users & Permissions", body: "Invite teammates and set roles.", href: "/settings/team" },
  { label: "General", body: "Language, timezone, and defaults." },
  { label: "Branding", body: "Make Ovanth look like your business." },
  { label: "API Keys", body: "Programmatic access to your workspace." },
];

export default function SettingsPage() {
  return (
    <Page>
      <PageHeader title="Settings" subtitle={`Configure ${BRAND} for how your business runs.`} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const inner = (
            <div
              className={`lit h-full rounded-[10px] border border-line bg-raised p-4 ${
                s.href ? "transition-colors hover:border-line-strong" : "opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{s.label}</p>
                {s.href ? (
                  <span className="text-ink-3">→</span>
                ) : (
                  <span className="rounded-full bg-hover px-1.5 py-px text-[9.5px] uppercase tracking-wide text-ink-3">
                    soon
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} prefetch className="block">
              {inner}
            </Link>
          ) : (
            <div key={s.label}>{inner}</div>
          );
        })}
      </div>
    </Page>
  );
}
