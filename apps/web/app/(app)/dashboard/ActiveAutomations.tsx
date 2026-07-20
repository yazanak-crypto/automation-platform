"use client";

import Link from "next/link";
import { Button, EmptyState, Section, SkeletonRows, modePill } from "@/components/ui";
import { useDashboard } from "./DashboardProvider";

const NAMES: Record<string, string> = { "lead-concierge": "Lead Concierge" };

export default function ActiveAutomations() {
  const { data, refresh } = useDashboard();
  const rows = data?.activations ?? null;
  const nudge = data?.nudge ?? null;

  async function setStatus(id: string, status: "active" | "paused") {
    await fetch(`/api/activations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    void refresh();
  }

  return (
    <Section label="Your automations">
      {/* Moment #3 candidate: graduation — the product's best news, told plainly. */}
      {nudge && (
        <Link
          href={`/automations/${nudge.activationId}`}
          className="rise moment-glow mb-4 block rounded-[14px] border p-5 transition-colors"
          style={{ borderColor: "var(--brass)", background: "var(--brass-dim)" }}
        >
          <p className="font-medium">Your AI has earned more autonomy</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            You approved {nudge.approvals} drafts — {nudge.wouldHaveAutoHandled} could have been
            handled instantly. Turn on Smart Automation? →
          </p>
        </Link>
      )}

      {rows === null ? (
        <SkeletonRows rows={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Put your first automation on duty"
          action={
            <Link
              href="/marketplace"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Browse the marketplace
            </Link>
          }
        >
          Start with the Lead Concierge — it watches your channels and drafts replies in your
          voice. Nothing sends without you.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((a) => (
            <li key={a.id} className="rise flex items-center justify-between gap-3 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <p className="truncate text-sm font-medium">{NAMES[a.automationSlug] ?? a.automationSlug}</p>
                {modePill(a.mode, a.status)}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tnum hidden text-[12px] text-ink-3 sm:block">
                  {a.channelIds.length} channel{a.channelIds.length === 1 ? "" : "s"}
                </span>
                <Link
                  href={`/automations/${a.id}`}
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                >
                  Autonomy
                </Link>
                <Button size="sm" onClick={() => setStatus(a.id, a.status === "active" ? "paused" : "active")}>
                  {a.status === "active" ? "Pause" : "Resume"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows !== null && rows.length > 0 && (
        <Link href="/marketplace" className="mt-3 inline-block text-[13px] text-ink-3 transition-colors hover:text-ink-2">
          Browse more automations →
        </Link>
      )}
      {rows?.some((a) => a.status === "paused") && (
        <p className="mt-2 text-[12px] text-ink-3">
          Paused — new messages wait in Conversations for your own reply. Nothing is lost.
        </p>
      )}
    </Section>
  );
}
