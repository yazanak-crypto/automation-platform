import { contactsToCsv, listContacts } from "@platform/core";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** CSV of the whole contact list — the business owning its own data. */
export async function GET(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const search = new URL(req.url).searchParams.get("q") ?? undefined;
  // Export honours the active search so "export what I'm looking at" works,
  // and takes the full result set rather than the current page.
  const { rows } = await listContacts(ctx.workspace.id, { search, limit: 200, offset: 0 });
  const csv = contactsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
