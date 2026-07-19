import { aiConfigured } from "@platform/ai";
import { getCreditStatus } from "@platform/core";
import { Notice } from "@/components/ui";

/** Server-rendered system state: AI setup + credit posture. Owner language only. */
export default async function SystemBanners({ workspaceId }: { workspaceId: string }) {
  if (!aiConfigured()) {
    return (
      <div className="mt-6">
        <Notice tone="wait" title="The AI engine isn't connected yet">
          Everything else works — conversations arrive and you can reply yourself. Connect an AI
          provider in your server settings to turn on drafting and automation.
        </Notice>
      </div>
    );
  }

  const credits = await getCreditStatus(workspaceId).catch(() => null);
  if (!credits) return null;

  if (credits.exhausted) {
    return (
      <div className="mt-6">
        <Notice tone="stop" title="AI credits used up — your AI is paused" href="/billing">
          New messages wait in Conversations for your own reply. Upgrade to put it back on duty →
        </Notice>
      </div>
    );
  }
  if (credits.remaining <= credits.allowance * 0.15) {
    return (
      <div className="mt-6">
        <Notice
          tone="wait"
          title={`${credits.remaining.toLocaleString()} AI credits left this month`}
          href="/billing"
        >
          At the current pace your AI will pause soon. See plans →
        </Notice>
      </div>
    );
  }
  return null;
}
