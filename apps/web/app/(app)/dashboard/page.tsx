import Link from "next/link";
import { getBrain } from "@platform/brain";
import { listActivations } from "@platform/core";
import { channels, db, messages } from "@platform/db";
import { and, eq, sql } from "drizzle-orm";
import { Notice, Page, PageHeader } from "@/components/ui";
import { Orbit } from "@/components/orbit";
import { requireWorkspace } from "@/lib/workspace";
import ActiveAutomations from "./ActiveAutomations";
import AttentionQueue from "./AttentionQueue";
import SetupChecklist from "./SetupChecklist";
import StatStrip from "./StatStrip";
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

  // Perf: these four reads are independent — run them concurrently, not in a
  // sequential await chain. (requireWorkspace is cache()'d, so it doesn't
  // re-query here — it shares the layout's result.)
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
  const waitingCount = waiting[0]?.n ?? 0;
  const hasChannel = (channelCount[0]?.n ?? 0) > 0;
  // Never-empty rule (spec §4): show the guided checklist until the workspace
  // is actually operating (a channel + an activation).
  const setupIncomplete = !hasChannel || activations.length === 0;

  // The status sentence: "What is happening?" answered before anything else.
  const status =
    active.length === 0
      ? "No automations on duty yet."
      : `${active.length} automation${active.length === 1 ? "" : "s"} on duty · ${
          waitingCount === 0
            ? "nothing waiting on you"
            : `${waitingCount} draft${waitingCount === 1 ? "" : "s"} waiting for you`
        }`;

  const brainConfirmed = brain?.profile.onboardingStatus === "confirmed";
  const suggested = brain?.knowledge.filter((k) => k.status === "suggested").length ?? 0;

  return (
    <Page wide>
      {/* The AI, alive — orbit of channels + activity behind the interface.
          Low opacity, pointer-safe, sits behind cards; never touches readability. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 right-0 -z-10 opacity-[0.32] md:left-56"
      >
        <Orbit className="h-full w-full" />
      </div>

      <PageHeader title={`Good ${daypart()}`} subtitle={status} />

      {/* The go-live moment (Design Direction, moment #1). */}
      {params.activated === "1" && (
        <div
          className="rise moment-glow mb-8 rounded-[14px] border p-6"
          style={{ borderColor: "var(--brass)", background: "var(--brass-dim)" }}
        >
          <p className="text-lg font-semibold tracking-[-0.01em]">Your concierge is on duty.</p>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-2">
            It&apos;s watching your channels now. Every reply it drafts will wait here for your
            approval — you&apos;ll see the first one the moment a customer writes in.
          </p>
        </div>
      )}

      {ctx && <SystemBanners workspaceId={ctx.workspace.id} />}

      {/* Brain-setup nudge lives in the checklist below when setup is incomplete. */}
      {suggested > 0 && (
        <div className="mt-3">
          <Notice
            tone="wait"
            title={`${suggested} learned fact${suggested === 1 ? "" : "s"} waiting for your review`}
            href="/brain"
          >
            Confirm what&apos;s right so the AI can use it in replies.
          </Notice>
        </div>
      )}

      {setupIncomplete ? (
        <SetupChecklist
          brainConfirmed={brainConfirmed}
          hasChannel={hasChannel}
          hasActivation={activations.length > 0}
        />
      ) : (
        <>
          <AttentionQueue />
          <StatStrip />
          <ActiveAutomations />
        </>
      )}

      <p className="mt-12 text-[12px] text-ink-3">
        Every AI action is recorded and explainable —{" "}
        <Link href="/conversations" className="underline underline-offset-4 hover:text-ink-2">
          open any conversation
        </Link>{" "}
        and ask &ldquo;Why this reply?&rdquo;
      </p>
    </Page>
  );
}
