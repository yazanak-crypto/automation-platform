import { getOnboardingStatus } from "@platform/brain";
import { findDormantItems, resolveDormancySettings } from "@platform/core";
import { db, workspaces } from "@platform/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/account-menu";
import { Orbit } from "@/components/orbit";
import { SupportChat } from "@/components/support-chat";
import { Wordmark } from "@/components/wordmark";
import NavLinks, { MobileTabBar } from "./nav-links";
import { planBadge } from "@/lib/plan-badge";
import { requireWorkspace } from "@/lib/workspace";

// The app shell (Design Direction §3.1): one calm room. Desktop sidebar with
// grouped nav + brass active marker; mobile gets a bottom tab bar.

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();

  // Spec §2 (DB-aware gate): a fresh, un-onboarded workspace never lands on an
  // empty dashboard — it's routed through onboarding first. Onboarding lives
  // OUTSIDE this (app) group, so it's never caught by this redirect. Uses a
  // single-column read, not the full brain (perf).
  if (ctx) {
    // A failed read must NOT degrade to "pending". Treating an unreachable
    // database as "not onboarded" sends a fully onboarded user to /onboarding,
    // where finishing writes a status nobody can read back — an unbreakable
    // loop caused by an outage rather than by state. Let it throw instead: the
    // error boundary offers a retry, which is honest and recoverable.
    let status: string;
    try {
      status = await getOnboardingStatus(ctx.workspace.id);
    } catch (err) {
      console.error("[onboarding-guard] READ FAILED", {
        clerkUserId: ctx.user.clerkId,
        workspaceId: ctx.workspace.id,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      throw err;
    }
    // TEMP DIAGNOSTIC (onboarding loop): kept for one more verification cycle.
    console.log("[onboarding-guard]", {
      clerkUserId: ctx.user.clerkId,
      workspaceId: ctx.workspace.id,
      statusRead: status,
      willRedirect: status !== "confirmed" && status !== "skipped",
    });
    if (status !== "confirmed" && status !== "skipped") redirect("/onboarding");
  }

  // The sidebar badge reads DERIVED entitlement, not workspaces.plan.
  //
  // workspaces.plan is written only by the manual bank-transfer path
  // (packages/core/src/payments.ts); applySubscriptionState deliberately leaves
  // it alone to avoid two writers on one field. So the old badge read "trial"
  // forever for every card-paying customer — it was displaying a column nobody
  // maintains. getCreditStatus is the single place that reconciles manual and
  // provider entitlement, and it is Redis-cached, so this costs one cache read.
  //
  // Never fails the shell: a badge is not worth a 500 on every page.
  const entitlement = ctx ? await planBadge(ctx.workspace.id) : null;

  // Overdue obligations, counted here so the badge appears on EVERY page rather
  // than only on the dashboard. A backlog the owner has to go looking for is a
  // backlog they will not find. SELECT-only — no model call, no message sent.
  let dormantCount = 0;
  if (ctx) {
    const [wsRow] = await db()
      .select({ autonomySettings: workspaces.autonomySettings })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspace.id))
      .limit(1);
    dormantCount = (
      await findDormantItems(ctx.workspace.id, resolveDormancySettings(wsRow?.autonomySettings))
    ).length;
  }

  return (
    <div className="flex min-h-screen">
      {/* The AI, alive — orbit of channels + activity behind every app screen.
          Low opacity, pointer-safe, offset from the sidebar; never touches
          readability. One instance for the whole app (Dashboard, Conversations,
          Marketplace, Brain, Channels, Billing). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 right-0 -z-10 opacity-[0.3] md:left-56"
      >
        <Orbit className="h-full w-full" />
      </div>

      <aside className="fixed inset-y-0 z-30 hidden w-56 flex-col border-r border-line px-5 py-6 md:flex">
        <Wordmark />
        <NavLinks dormantCount={dormantCount} />
        <div className="mt-auto border-t border-line pt-4">
          <AccountMenu
            showDetails
            name={ctx?.workspace.name}
            plan={entitlement?.plan}
            planLabel={entitlement?.label}
            trialDaysLeft={entitlement?.trialDaysLeft}
          />
        </div>
      </aside>

      <div className="w-full md:pl-56">
        {/* Mobile top bar: identity + account. Navigation lives in the tab bar. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/95 px-5 py-3 backdrop-blur md:hidden">
          <Wordmark />
          <AccountMenu />
        </header>
        {children}
      </div>

      <MobileTabBar />
      <SupportChat />
    </div>
  );
}
