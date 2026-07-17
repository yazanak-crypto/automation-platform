import { embed } from "@platform/ai";
import { runIngest } from "@platform/brain";
import {
  QUEUE_NAMES,
  type BrainEmbedJob,
  type BrainIngestJob,
} from "@platform/core";
import { db, knowledgeItems } from "@platform/db";
import { Worker, type ConnectionOptions } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";

export function startBrainWorkers(connection: ConnectionOptions) {
  const ingestWorker = new Worker<BrainIngestJob>(
    QUEUE_NAMES.brainIngest,
    async (job) => {
      console.log(`[brain.ingest] ${job.data.workspaceId} ← ${job.data.url}`);
      return runIngest(job.data.workspaceId, job.data.url);
    },
    { connection, concurrency: 2 },
  );

  const embedWorker = new Worker<BrainEmbedJob>(
    QUEUE_NAMES.brainEmbed,
    async (job) => {
      const { workspaceId, knowledgeItemId } = job.data;
      const rows = await db()
        .select({ id: knowledgeItems.id, title: knowledgeItems.title, content: knowledgeItems.content })
        .from(knowledgeItems)
        .where(
          and(
            eq(knowledgeItems.id, knowledgeItemId),
            eq(knowledgeItems.workspaceId, workspaceId),
            isNull(knowledgeItems.embedding),
          ),
        )
        .limit(1);
      const item = rows[0];
      if (!item) return { skipped: true };
      const vectorValue = await embed(workspaceId, `${item.title}\n\n${item.content}`);
      if (!vectorValue) return { skipped: true }; // no VOYAGE_API_KEY — graceful degrade
      await db()
        .update(knowledgeItems)
        .set({ embedding: vectorValue })
        .where(eq(knowledgeItems.id, item.id));
      return { embedded: true };
    },
    { connection, concurrency: 4 },
  );

  for (const w of [ingestWorker, embedWorker]) {
    w.on("failed", (job, err) =>
      console.error(`[${w.name}] job ${job?.id} failed:`, err.message),
    );
  }
  return [ingestWorker, embedWorker];
}
