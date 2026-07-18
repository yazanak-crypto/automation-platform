import * as Sentry from "@sentry/node";
import { pollEmailChannel } from "@platform/channels";
import { webchatDraftQueue } from "@platform/core";
import { channels, db } from "@platform/db";
import { and, eq, isNotNull } from "drizzle-orm";

// Email ingestion (M1 step 7): poll every active email channel and feed new
// messages into the SAME draft pipeline web chat uses. No Gmail knowledge
// here — that lives inside the channels package.

const POLL_INTERVAL_MS = 2 * 60 * 1000;

async function sweep() {
  const emailChannels = await db()
    .select({
      id: channels.id,
      workspaceId: channels.workspaceId,
      connectionId: channels.connectionId,
      config: channels.config,
    })
    .from(channels)
    .where(
      and(
        eq(channels.type, "email"),
        eq(channels.status, "active"),
        isNotNull(channels.connectionId),
      ),
    );

  for (const channel of emailChannels) {
    try {
      const ingested = await pollEmailChannel(channel);
      for (const item of ingested) {
        await webchatDraftQueue().add(
          "draft",
          {
            workspaceId: channel.workspaceId,
            conversationId: item.conversationId,
            messageId: item.messageId,
          },
          { jobId: `draft-${item.messageId}`, attempts: 2, removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } },
        );
      }
      if (ingested.length > 0) {
        console.log(`[email.poll] channel ${channel.id}: ${ingested.length} new message(s)`);
      }
    } catch (err) {
      console.error(`[email.poll] channel ${channel.id} failed:`, err);
      Sentry.captureException(err);
    }
  }
}

export function startEmailPolling() {
  const timer = setInterval(() => void sweep(), POLL_INTERVAL_MS);
  void sweep();
  return () => clearInterval(timer);
}
