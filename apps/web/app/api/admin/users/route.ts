import { db, users } from "@platform/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** List every account for the admin console. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return NextResponse.json(rows);
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

/** Toggle a single account's activation. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const rows = await db()
    .update(users)
    .set({ isActive: parsed.data.isActive })
    .where(eq(users.id, parsed.data.userId))
    .returning({ id: users.id, isActive: users.isActive });
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
