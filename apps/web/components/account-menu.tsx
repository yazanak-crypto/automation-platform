"use client";

import { UserButton } from "@clerk/nextjs";

// The account menu — Clerk's UserButton, extended with our own links and
// themed to match. Provides: Account settings, Billing, Manage profile,
// Switch account (when multi-session is enabled in Clerk), Sign out.
// No custom auth — this is the existing Clerk setup.

const Gear = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 3v2m0 10v2m7-7h-2M5 10H3m11.5-4.5-1.4 1.4M6.9 13.1l-1.4 1.4m9-.1-1.4-1.4M6.9 6.9 5.5 5.5" />
  </svg>
);
const Card = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="14" height="10" rx="2" />
    <path d="M3 8h14" />
  </svg>
);

export function AccountMenu({ showDetails = false, name, plan }: { showDetails?: boolean; name?: string; plan?: string }) {
  const button = (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          userButtonAvatarBox: "h-8 w-8",
          userButtonPopoverCard: "shadow-2xl",
          userButtonPopoverFooter: "hidden",
        },
      }}
    >
      <UserButton.MenuItems>
        <UserButton.Link label="Account settings" labelIcon={<Gear />} href="/settings" />
        <UserButton.Link label="Billing" labelIcon={<Card />} href="/billing" />
        <UserButton.Action label="manageAccount" />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );

  if (!showDetails) return button;

  return (
    <div className="flex items-center gap-2.5">
      {button}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-tight">{name ?? "Workspace"}</p>
        <p className="text-[11px] capitalize text-ink-3">{plan ?? "trial"} plan</p>
      </div>
    </div>
  );
}
