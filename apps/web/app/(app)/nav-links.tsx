"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Icons: 1.5px-stroke minimal set, inline so no icon-lib dependency.
const ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <path d="M3 10.5 10 4l7 6.5M5 9v7h10V9" />
  ),
  conversations: (
    <path d="M4 5h12v8H8l-4 3V5z" />
  ),
  setup: (
    <path d="M4 6h12M4 10h12M4 14h7M15.5 13.5l1.5 1.5 2.5-2.5" />
  ),
  orders: (
    <path d="M6 4h8l2 3v9H4V7l2-3zM4 7h12M8 10h4" />
  ),
  contacts: (
    <path d="M10 9.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zM4.5 16a5.5 5.5 0 0 1 11 0" />
  ),
  marketplace: (
    <path d="M4 7l1-3h10l1 3M4 7h12v9H4V7zm4 3h4" />
  ),
  brain: (
    <path d="M10 3a5 5 0 0 1 5 5c0 2-1 3-1 5H6c0-2-1-3-1-5a5 5 0 0 1 5-5zM8 16h4" />
  ),
  channels: (
    <path d="M7 12a3 3 0 1 1 0-6l2 1m2 6a3 3 0 1 0 0 6l2-1M7 9l6 5" />
  ),
  billing: (
    <path d="M3 7h14v8H3V7zm0 3h14" />
  ),
  analytics: (
    <path d="M4 16V9m4 7V5m4 11v-4m4 4V8" />
  ),
  settings: (
    <path d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10 3v2m0 10v2m7-7h-2M5 10H3m11.5-4.5-1.4 1.4M6.9 13.1l-1.4 1.4m9-.1-1.4-1.4M6.9 6.9 5.5 5.5" />
  ),
  help: (
    <path d="M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm-1.6-8.5a1.6 1.6 0 1 1 2.4 1.4c-.6.4-.8.7-.8 1.35M10 14h.01" />
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] shrink-0">
      {ICONS[name]}
    </svg>
  );
}

const GROUPS: { label: string; links: { href: string; label: string; icon: string; soon?: boolean }[] }[] = [
  {
    label: "Operate",
    links: [
      { href: "/dashboard", label: "Overview", icon: "dashboard" },
      { href: "/conversations", label: "Conversations", icon: "conversations" },
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/contacts", label: "Contacts", icon: "contacts" },
      { href: "/marketplace", label: "Automations", icon: "marketplace" },
      { href: "/brain", label: "Knowledge", icon: "brain" },
      { href: "/brain/setup", label: "Guided setup", icon: "setup" },
      { href: "/channels", label: "Channels", icon: "channels" },
      { href: "/analytics", label: "Analytics", icon: "analytics" },
      { href: "/billing", label: "Billing", icon: "billing" },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/help", label: "Help", icon: "help" },
    ],
  },
];

// Hrefs that have a more specific sibling in the nav must match exactly, or
// both entries light up — /brain would stay active while on /brain/setup.
const EXACT_ONLY = new Set(["/brain"]);

function isActive(pathname: string, href: string) {
  if (EXACT_ONLY.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/dashboard" && pathname.startsWith("/automations"));
}

export default function NavLinks({ dormantCount = 0 }: { dormantCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="mt-7 flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-3">
            {g.label}
          </p>
          <div className="flex flex-col gap-px">
            {g.links.map((l) => {
              const active = isActive(pathname, l.href);
              const cls = `relative flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] transition-colors duration-150 ${
                active ? "bg-hover text-ink" : "text-ink-2 hover:bg-raised hover:text-ink"
              }`;
              const inner = (
                <>
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full" style={{ background: "var(--brass)" }} />
                  )}
                  <Icon name={l.icon} />
                  {l.label}
                  {/* Overdue count, on Conversations because that is where the
                      owner acts on most of it. Rendered only when non-zero: a
                      permanent "0" is furniture, and this must read as an
                      exception rather than a fixture. */}
                  {l.href === "/conversations" && dormantCount > 0 && (
                    <span className="tnum ml-auto rounded-full bg-stop-dim px-1.5 py-px text-[10.5px] font-medium text-stop">
                      {dormantCount}
                    </span>
                  )}
                  {l.soon && (
                    <span className="ml-auto rounded-full bg-hover px-1.5 py-px text-[9.5px] uppercase tracking-wide text-ink-3">
                      soon
                    </span>
                  )}
                </>
              );
              // Help opens the AI assistant panel instead of navigating.
              if (l.href === "/help") {
                return (
                  <button
                    key={l.href}
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent("ovanth:help-open"))}
                    className={`${cls} w-full text-left`}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={l.href} href={l.href} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Mobile bottom tab bar — the phone-first surface (fixes broken mobile nav). */
export function MobileTabBar() {
  const pathname = usePathname();
  const tabs = [
    { href: "/dashboard", label: "Home", icon: "dashboard" },
    { href: "/conversations", label: "Inbox", icon: "conversations" },
    { href: "/marketplace", label: "Market", icon: "marketplace" },
    { href: "/brain", label: "Brain", icon: "brain" },
    { href: "/channels", label: "Channels", icon: "channels" },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] ${
              active ? "text-ink" : "text-ink-3"
            }`}
          >
            <span className={active ? "text-brass" : ""}>
              <Icon name={t.icon} />
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
