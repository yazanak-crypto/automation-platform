import { confirmPayment, rejectPayment } from "@platform/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), paymentId: z.string().uuid() }),
  z.object({
    action: z.literal("reject"),
    paymentId: z.string().uuid(),
    // Rejection must be explained — it revokes the customer's access.
    note: z.string().trim().min(3).max(500),
  }),
]);

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { userId } = await auth();
  const reviewedBy = userId ?? "admin";

  const result =
    parsed.data.action === "confirm"
      ? await confirmPayment(parsed.data.paymentId, reviewedBy)
      : await rejectPayment(parsed.data.paymentId, reviewedBy, parsed.data.note);

  if (!result) {
    return NextResponse.json(
      { error: "That payment is not awaiting review." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
}
