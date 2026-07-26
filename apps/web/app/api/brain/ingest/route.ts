import { parsePublicHttpUrl, IngestUrlError } from "@platform/brain";
import { brainIngestQueue, takeDailyLimit } from "@platform/core";
import { ingestRequestSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const parsed = ingestRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid URL" }, { status: 400 });
  }

  let url: string;
  try {
    url = parsePublicHttpUrl(parsed.data.url).toString();
  } catch (err) {
    const msg = err instanceof IngestUrlError ? err.message : "URL not allowed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!(await takeDailyLimit(`ingest:${ctx.workspace.id}`, 10))) {
    return NextResponse.json(
      { error: "Daily website-import limit reached — try again tomorrow." },
      { status: 429 },
    );
  }

  // Audit P0-3: unique jobId per request (a fixed id collided with completed
  // jobs kept for an hour, silently no-oping re-ingests). Concurrency is
  // guarded by an explicit check against live jobs instead.
  const queue = brainIngestQueue();
  const live = await queue.getJobs(["waiting", "active", "delayed"]);
  if (live.some((j) => j.data.workspaceId === ctx.workspace.id)) {
    return NextResponse.json(
      { error: "We're already reading a website for you — give it a moment." },
      { status: 409 },
    );
  }
  const job = await queue.add(
    "ingest",
    { workspaceId: ctx.workspace.id, url },
    {
      jobId: `ingest-${ctx.workspace.id}-${Date.now()}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
      attempts: 1,
    },
  );
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
