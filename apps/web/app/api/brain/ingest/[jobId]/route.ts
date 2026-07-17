import { brainIngestQueue } from "@platform/core";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  const { jobId } = await params;
  const job = await brainIngestQueue().getJob(jobId);
  // Tenancy: a job is only visible to the workspace that owns it.
  if (!job || job.data.workspaceId !== ctx.workspace.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const state = await job.getState();
  return NextResponse.json({
    state, // "waiting" | "active" | "completed" | "failed" | ...
    result: state === "completed" ? job.returnvalue : undefined,
    failedReason: state === "failed" ? "We couldn't read that website." : undefined,
  });
}
