import "server-only";
import { type WebchatDraftJob, webchatDraftQueue } from "@platform/core";

// Server-only job boundary. Route handlers call these AFTER validating the
// request — they never touch BullMQ or the queue wiring directly. The
// `server-only` import makes it a build error to pull this (and its worker-side
// dependencies) into any client bundle.

/**
 * Enqueue a draft job for the AI reply pipeline (shared by web chat, email, and
 * Meta webhooks). Idempotent on messageId — retried deliveries never double-draft.
 */
export async function enqueueDraftJob(job: WebchatDraftJob): Promise<void> {
  await webchatDraftQueue().add("draft", job, {
    jobId: `draft-${job.messageId}`,
    attempts: 2,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });
}
