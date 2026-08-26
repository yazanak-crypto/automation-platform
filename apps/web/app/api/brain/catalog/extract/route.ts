import { CatalogExtractError, extractCatalog } from "@platform/brain";
import { getVertical } from "@platform/brain/verticals";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

// Extraction only — this route NEVER writes. The owner reviews the rows it
// returns and confirms separately, which is what makes "nothing saves until
// you confirm" true by construction rather than by discipline.

export const runtime = "nodejs";
// Vision on a multi-page PDF is slow; the platform default would cut it off
// mid-extraction and report a generic failure.
export const maxDuration = 120;

function questionFor(verticalId: string, questionId: string) {
  return getVertical(verticalId).questions.find(
    (q) => q.id === questionId && q.input === "catalog",
  );
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });

  const verticalId = String(form.get("vertical") ?? "");
  const questionId = String(form.get("questionId") ?? "");
  const question = questionFor(verticalId, questionId);
  if (!question?.catalog) {
    return NextResponse.json({ error: "Unknown catalog question." }, { status: 400 });
  }

  const file = form.get("file");
  const text = form.get("text");

  try {
    const result = await extractCatalog({
      workspaceId: ctx.workspace.id,
      catalog: question.catalog,
      verticalLabel: getVertical(verticalId).label,
      ...(file instanceof File
        ? {
            file: {
              bytes: new Uint8Array(await file.arrayBuffer()),
              mediaType: file.type,
              name: file.name,
            },
          }
        : {}),
      ...(typeof text === "string" && text.trim() ? { text } : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CatalogExtractError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // The owner sees a sentence; the detail goes to the logs, not the browser.
    console.error("[catalog.extract] failed:", err);
    return NextResponse.json(
      { error: "We couldn't read that file. Try a clearer photo, or paste the items as text." },
      { status: 502 },
    );
  }
}
