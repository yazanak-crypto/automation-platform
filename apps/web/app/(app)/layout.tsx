import { UserButton } from "@clerk/nextjs";
import { getBrain } from "@platform/brain";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import NavLinks, { MobileTabBar } from "./nav-links";
import { requireWorkspace } from "@/lib/workspace";

// The app shell (Design Direction §3.1): one calm room. Desktop sidebar with
// grouped nav + brass active marker; mobile gets a bottom tab bar.

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();

  // Spec §2 (DB-aware gate): a fresh, un-onboarded workspace never lands on an
  // empty dashboard — it's routed through onboarding first. Onboarding lives
  // OUTSIDE this (app) group, so it's never caught by this redirect.
  if (ctx) {
    const brain = await getBrain(ctx.workspace.id).catch(() => null);
    const onboarded =
      brain?.profile.onboardingStatus === "confirmed" ||
      brain?.profile.onboardingStatus === "skipped";
    if (!onboarded) redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 z-30 hidden w-56 flex-col border-r border-line px-5 py-6 md:flex">
        <Wordmark />
        <NavLinks />
        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-4">
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-tight">
              {ctx?.workspace.name ?? "Workspace"}
            </p>
            <p className="text-[11px] capitalize text-ink-3">{ctx?.workspace.plan ?? "trial"} plan</p>
          </div>
        </div>
      </aside>

      <div className="w-full md:pl-56">
        {/* Mobile top bar: identity + account. Navigation lives in the tab bar. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/95 px-5 py-3 backdrop-blur md:hidden">
          <Wordmark />
          <UserButton />
        </header>
        {children}
      </div>

      <MobileTabBar />
    </div>
  );
}
