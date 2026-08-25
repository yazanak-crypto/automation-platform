"use client";

import { UserButton } from "@clerk/nextjs";
import { PALETTE } from "@/lib/palette";

// --line from globals.css, as a literal (see the note in lib/palette.ts on why
// Clerk cannot take var()).
const LINE = "rgba(255, 255, 255, 0.08)";

/**
 * One menu row, every state pinned explicitly.
 *
 * `color` is repeated on each state rather than left to inherit: the original
 * bug was the label going dark, and hover/focus are exactly where a stray
 * inherited color would creep back in. `&:disabled` drops to the faint ink so
 * a disabled row still reads as text rather than vanishing.
 */
const ROW = {
  color: PALETTE.cream,
  "&:hover": { color: PALETTE.cream, backgroundColor: "rgba(255, 255, 255, 0.055)" },
  "&:focus": { color: PALETTE.cream },
  "&:focus-visible": { outline: "none", boxShadow: `0 0 0 1px ${PALETTE.brass}` },
  "&:active": { color: PALETTE.cream },
  "&:disabled": { color: PALETTE.creamFaint, backgroundColor: "transparent" },
} as const;

/** Row icons. Dimmer than the label, but never below the legibility floor. */
const ICON = {
  color: PALETTE.creamMuted,
  opacity: 1,
} as const;

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

/**
 * The plan badge.
 *
 * `plan` is the DERIVED entitlement from getCreditStatus, never
 * workspaces.plan — that column is written only by the manual bank-transfer
 * path, so it reads "trial" forever for every card customer.
 *
 * Weighted so the sidebar stays quiet: trial is plain text because it is a
 * countdown rather than a status, Starter gets a neutral chip, and only
 * Premium gets brass. Brass is the identity accent (globals.css: "moments,
 * metrics, focus. Never buttons.") — a plan badge is identity, not a control.
 */
function PlanBadge({ plan, label, trialDaysLeft }: { plan: string; label: string; trialDaysLeft?: number | null }) {
  if (plan === "pro") {
    return (
      <span className="mt-0.5 inline-flex items-center rounded-full bg-brass-dim px-1.5 py-px text-[10px] font-medium leading-[1.4] text-brass">
        {label}
      </span>
    );
  }
  if (plan === "starter") {
    return (
      <span className="mt-0.5 inline-flex items-center rounded-full bg-hover px-1.5 py-px text-[10px] font-medium leading-[1.4] text-ink-2">
        {label}
      </span>
    );
  }
  return (
    <p className="text-[11px] text-ink-3">
      {label}
      {/* The number is the useful part of a trial, so it is shown inline
          rather than requiring a trip to /billing. */}
      {typeof trialDaysLeft === "number" && trialDaysLeft > 0 && (
        <> · {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</>
      )}
    </p>
  );
}

export function AccountMenu({
  showDetails = false,
  name,
  plan,
  planLabel,
  trialDaysLeft,
}: {
  showDetails?: boolean;
  name?: string;
  plan?: string;
  planLabel?: string;
  trialDaysLeft?: number | null;
}) {
  const button = (
    <UserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          userButtonAvatarBox: "h-8 w-8",

          // ── Why style OBJECTS and not Tailwind classes ────────────────────
          // The className approach was tried and measurably failed: even with
          // `!important` on all four rows the text stayed black, which rules
          // out a specificity fight and means the classes were not affecting
          // these elements at all. Style objects are emitted as CSS by
          // clerk-js itself, so they depend on nothing external — not the
          // Tailwind sheet, not class application, not CSS-variable
          // resolution, not Clerk's neutral-ramp derivation.
          //
          // Literal hex for the same reason. These mirror :root in
          // globals.css via lib/palette.ts (cream #f4f4f5 on charcoal
          // #131315); keep them in step if the palette moves.
          userButtonPopoverCard: {
            backgroundColor: PALETTE.charcoal,
            border: `1px solid ${LINE}`,
            color: PALETTE.cream,
          },
          userButtonPopoverMain: { backgroundColor: "transparent" },
          userButtonPopoverActions: { borderColor: LINE },

          // Built-in rows: Manage account, Sign out.
          userButtonPopoverActionButton: ROW,
          userButtonPopoverActionButtonIconBox: ICON,
          userButtonPopoverActionButtonIcon: ICON,

          // Our rows: Account settings, Billing. Different slot, same styling —
          // theming only the built-ins would leave these two invisible.
          userButtonPopoverCustomItemButton: ROW,
          userButtonPopoverCustomItemButtonIconBox: ICON,

          // Identity block at the top of the card.
          userPreviewMainIdentifier: { color: PALETTE.cream },
          userPreviewSecondaryIdentifier: { color: PALETTE.creamMuted },

          userButtonPopoverFooter: { display: "none" },
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
        <PlanBadge
          plan={plan ?? "trial"}
          label={planLabel ?? "Free trial"}
          trialDaysLeft={trialDaysLeft}
        />
      </div>
    </div>
  );
}
