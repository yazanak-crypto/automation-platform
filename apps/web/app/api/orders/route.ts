import { db, contacts, orderItems, orders } from "@platform/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspace, unauthorized } from "@/lib/workspace";

export const runtime = "nodejs";

/** The Orders list. Customer name and date per row, plus what the tab must show. */
export async function GET(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();

  const status = new URL(req.url).searchParams.get("status");
  const where =
    status && status !== "all"
      ? and(eq(orders.workspaceId, ctx.workspace.id), eq(orders.status, status as "pending"))
      : eq(orders.workspaceId, ctx.workspace.id);

  const rows = await db()
    .select({
      id: orders.id,
      status: orders.status,
      customerName: orders.customerName,
      contactId: orders.contactId,
      contactName: contacts.displayName,
      requestedForText: orders.requestedForText,
      createdAt: orders.createdAt,
      decidedAt: orders.decidedAt,
      // The mismatch the tab has to surface: decided, but the customer was
      // never told. Sent as data, not inferred client-side from a timestamp.
      decisionNotifiedAt: orders.decisionNotifiedAt,
      decisionNotifyError: orders.decisionNotifyError,
      pendingReason: orders.pendingReason,
    })
    .from(orders)
    .leftJoin(contacts, eq(contacts.id, orders.contactId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(200);

  // One query for every order's lines, rather than N.
  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db()
        .select({ orderId: orderItems.orderId, nameText: orderItems.nameText, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
    : [];

  return NextResponse.json({
    orders: rows.map((r) => ({
      ...r,
      items: items.filter((i) => i.orderId === r.id).map((i) => `${i.quantity}× ${i.nameText}`),
    })),
  });
}
