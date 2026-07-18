import Link from "next/link";
import { aiConfigured } from "@platform/ai";
import { getCreditStatus } from "@platform/core";

/** Server-rendered system state banners: AI setup + credit warnings. */
export default async function SystemBanners({ workspaceId }: { workspaceId: string }) {
  if (!aiConfigured()) {
    return (
      <div className="mt-6 rounded-xl border border-amber-900/70 bg-amber-950/20 p-5">
        <p className="font-medium text-amber-200">The AI engine isn&apos;t set up yet</p>
        <p className="mt-1 text-sm text-amber-300/70">
          Everything else works — conversations arrive and you can reply yourself. Add an AI
          provider key (ANTHROPIC_API_KEY) to turn on drafting and automation.
        </p>
      </div>
    );
  }

  const credits = await getCreditStatus(workspaceId).catch(() => null);
  if (!credits) return null;

  if (credits.exhausted) {
    return (
      <Link
        href="/billing"
        className="mt-6 block rounded-xl border border-red-900/70 bg-red-950/20 p-5 hover:border-red-700"
      >
        <p className="font-medium text-red-200">AI credits used up — the AI has paused</p>
        <p className="mt-1 text-sm text-red-300/70">
          New messages wait in Conversations for your own reply. Upgrade to keep the AI working →
        </p>
      </Link>
    );
  }
  if (credits.remaining <= credits.allowance * 0.15) {
    return (
      <Link
        href="/billing"
        className="mt-6 block rounded-xl border border-amber-900/70 bg-amber-950/20 p-5 hover:border-amber-700"
      >
        <p className="font-medium text-amber-200">
          {credits.remaining.toLocaleString()} AI credits left this month
        </p>
        <p className="mt-1 text-sm text-amber-300/70">
          At the current pace the AI will pause soon. See plans →
        </p>
      </Link>
    );
  }
  return null;
}
