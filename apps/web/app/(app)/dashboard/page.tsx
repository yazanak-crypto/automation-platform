import Link from "next/link";
import { getBrain } from "@platform/brain";
import { requireWorkspace } from "@/lib/workspace";
import ActiveAutomations from "./ActiveAutomations";
import StatStrip from "./StatStrip";
import SystemBanners from "./SystemBanners";
import AttentionQueue from "./AttentionQueue";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireWorkspace();
  const brain = ctx ? await getBrain(ctx.workspace.id) : null;
  const status = brain?.profile.onboardingStatus;
  const suggested = brain?.knowledge.filter((k) => k.status === "suggested").length ?? 0;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {status !== "confirmed" && (
        <Link
          href={status === "draft_ready" ? "/onboarding" : "/onboarding"}
          className="mt-6 block rounded-xl border border-indigo-900 bg-indigo-950/40 p-5 hover:border-indigo-700"
        >
          <p className="font-medium text-indigo-200">Finish setting up your Business Brain</p>
          <p className="mt-1 text-sm text-indigo-300/70">
            The more the platform knows about your business, the better every automation works.
          </p>
        </Link>
      )}

      {suggested > 0 && (
        <Link
          href="/brain"
          className="mt-4 block rounded-xl border border-neutral-800 p-5 hover:border-neutral-600"
        >
          <p className="font-medium">
            {suggested} suggested knowledge item{suggested === 1 ? "" : "s"} waiting for review
          </p>
          <p className="mt-1 text-sm text-neutral-400">Confirm what&apos;s right so the AI can use it.</p>
        </Link>
      )}

      {ctx && <SystemBanners workspaceId={ctx.workspace.id} />}
      <StatStrip />
      <AttentionQueue />
      <ActiveAutomations />

      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/marketplace" className="underline underline-offset-4">Marketplace</Link>
        <Link href="/brain" className="underline underline-offset-4">Business Brain</Link>
        <Link href="/channels" className="underline underline-offset-4">Channels</Link>
        <Link href="/conversations" className="underline underline-offset-4">Conversations</Link>
      </div>
    </main>
  );
}
