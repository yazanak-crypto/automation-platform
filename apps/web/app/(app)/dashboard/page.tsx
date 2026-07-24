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
import SetupChecklist from "./SetupChecklist";
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

  // Until channels + an activation exist, guide the owner with a prominent
  // checklist (their clear "what do I do next" — see SetupChecklist).
  const setupComplete = brainConfirmed && hasChannel && hasActivation;

  return (
    <Page wide>
      <PageHeader
        title="Overview"
        subtitle={`Here's what Ovanth is working on for you${firstName ? `, ${firstName}` : ""}.`}
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

      {!setupComplete && (
        <SetupChecklist
          brainConfirmed={brainConfirmed}
          hasChannel={hasChannel}
          hasActivation={hasActivation}
        />
      )}

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
