import { parsePublicHttpUrl, IngestUrlError } from "@platform/brain";
import { brainIngestQueue, takeDailyLimit } from "@platform/core";
import { ingestRequestSchema } from "@platform/schemas";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
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

  // jobId dedupe: one concurrent ingest per workspace.
  const job = await brainIngestQueue().add(
    "ingest",
    { workspaceId: ctx.workspace.id, url },
    {
      jobId: `ingest-${ctx.workspace.id}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
      attempts: 1,
    },
  );
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
