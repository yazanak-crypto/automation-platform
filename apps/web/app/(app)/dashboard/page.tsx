import Link from "next/link";
import { getBrain } from "@platform/brain";
import { listActivations } from "@platform/core";
import { channels, db, messages } from "@platform/db";
import { and, eq, sql } from "drizzle-orm";
import { Notice, Page, PageHeader } from "@/components/ui";
import { requireWorkspace } from "@/lib/workspace";
import ActiveAutomations from "./ActiveAutomations";
import AttentionQueue from "./AttentionQueue";
import ChannelOrbit from "./ChannelOrbit";
import { DashboardProvider } from "./DashboardProvider";
import LiveLedger from "./LiveLedger";
import MetricCards from "./MetricCards";
import RecentConversations from "./RecentConversations";
import SystemBanners from "./SystemBanners";

export const dynamic = "force-dynamic";

function daypart() {
  const h = new Date().getHours();
  return h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireWorkspace();
  const wsId = ctx?.workspace.id;

  const [brain, activations, waiting, channelCount] = wsId
    ? await Promise.all([
        getBrain(wsId),
        listActivations(wsId),
        db()
          .select({ n: sql<number>`count(*)::int` })
          .from(messages)
          .where(and(eq(messages.workspaceId, wsId), eq(messages.draftStatus, "pending_approval"))),
        db()
          .select({ n: sql<number>`count(*)::int` })
          .from(channels)
          .where(eq(channels.workspaceId, wsId)),
      ])
    : [null, [], [{ n: 0 }], [{ n: 0 }]];

  const active = activations.filter((a) => a.status === "active");
  const hasChannel = (channelCount[0]?.n ?? 0) > 0;
  const brainConfirmed = brain?.profile.onboardingStatus === "confirmed";
  const hasActivation = activations.length > 0;
  const suggested = brain?.knowledge.filter((k) => k.status === "suggested").length ?? 0;
  const firstName = ctx?.user.name?.trim().split(/\s+/)[0];

  // Setup progress — shown as a small corner card, not a full-page takeover.
  const setupSteps = [
    { done: brainConfirmed, label: "Confirm your Business Brain", href: "/onboarding" },
    { done: hasChannel, label: "Connect a channel", href: "/channels" },
    { done: hasActivation, label: "Activate an automation", href: "/marketplace" },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const nextStep = setupSteps.find((s) => !s.done);

  return (
    <Page wide>
      <PageHeader
        title="Overview"
        subtitle={`Here's what Otto is working on for you${firstName ? `, ${firstName}` : ""}.`}
        action={
          <span className="rounded-lg border border-line bg-raised px-3 py-1.5 text-[12.5px] text-ink-2">
            Last 30 days
          </span>
        }
      />

      {params.activated === "1" && (
        <div
          className="rise moment-glow mb-8 rounded-[14px] border p-6"
          style={{ borderColor: "var(--brass)", background: "var(--brass-dim)" }}
        >
          <p className="text-lg font-semibold tracking-[-0.01em]">Your concierge is on duty.</p>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-2">
            It&apos;s watching your channels now. Every reply it drafts will wait for your approval.
          </p>
        </div>
      )}

      {ctx && <SystemBanners workspaceId={ctx.workspace.id} />}
      {suggested > 0 && (
        <div className="mb-6">
          <Notice
            tone="wait"
            title={`${suggested} learned fact${suggested === 1 ? "" : "s"} waiting for your review`}
            href="/brain"
          >
            Confirm what&apos;s right so the AI can use it in replies.
          </Notice>
        </div>
      )}

      {/* One provider = one fetch + one 15s poll feeds every widget below
          (replaces the old 6-endpoint fan-out + 5 pollers). */}
      <DashboardProvider>
        <AttentionQueue />

        {/* Command center: AI core left, real business metrics right. */}
        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <ChannelOrbit />
          <div className="space-y-2.5">
            {/* Setup checklist — compact corner card, only until fully live. */}
            {nextStep && (
              <div className="lit rounded-[12px] border border-l-2 border-line border-l-brass bg-raised p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium">Finish setup</p>
                  <span className="tnum text-[11px] text-ink-3">{setupDone}/3</span>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-2">{nextStep.label}</p>
                <Link
                  href={nextStep.href}
                  prefetch
                  className="press-glow mt-3 inline-block rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-medium text-black active:scale-[0.97]"
                >
                  Continue →
                </Link>
              </div>
            )}
            <MetricCards />
          </div>
        </div>

        {/* Lower row: recent conversations · automations · live ledger. */}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
          <RecentConversations />
          <ActiveAutomations />
          <LiveLedger />
        </div>
      </DashboardProvider>
    </Page>
  );
}
