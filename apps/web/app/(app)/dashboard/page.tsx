import Link from "next/link";
import { getBrain } from "@platform/brain";
import { listActivations } from "@platform/core";
import { db, messages } from "@platform/db";
import { and, eq, sql } from "drizzle-orm";
import { Notice, Page, PageHeader } from "@/components/ui";
import { requireWorkspace } from "@/lib/workspace";
import ActiveAutomations from "./ActiveAutomations";
import AttentionQueue from "./AttentionQueue";
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
  const brain = ctx ? await getBrain(ctx.workspace.id) : null;
  const activations = ctx ? await listActivations(ctx.workspace.id) : [];
  const active = activations.filter((a) => a.status === "active");

  const waiting = ctx
    ? await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(eq(messages.workspaceId, ctx.workspace.id), eq(messages.draftStatus, "pending_approval")),
        )
    : [{ n: 0 }];
  const waitingCount = waiting[0]?.n ?? 0;

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

      {!brainConfirmed && (
        <div className="mt-6">
          <Notice tone="brass" title="Finish teaching it your business" href="/onboarding">
            The more your Business Brain knows, the better every reply gets. Two minutes.
          </Notice>
        </div>
      )}
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

      <AttentionQueue />
      <StatStrip />
      <ActiveAutomations />

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
