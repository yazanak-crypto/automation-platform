import { listContacts, type ContactSort } from "@platform/core";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

const SORTS = ["last_contact", "first_contact", "name", "conversations"] as const;

export async function GET(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const sortParam = url.searchParams.get("sort");
  const sort = (SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as ContactSort)
    : "last_contact";
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const { rows, total } = await listContacts(ctx.workspace.id, {
    search: url.searchParams.get("q") ?? undefined,
    sort,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return NextResponse.json({ contacts: rows, total });
}
