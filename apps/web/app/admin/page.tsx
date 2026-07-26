import { notFound } from "next/navigation";
import { db, users } from "@platform/db";
import { desc } from "drizzle-orm";
import { Wordmark } from "@/components/wordmark";
import { isAdmin } from "@/lib/admin";
import UserTable from "./UserTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

/**
 * Account activation console. Gated by a single Clerk user id (ADMIN_USER_ID).
 * Lives outside the (app) group so it is never caught by the activation
 * redirect — the admin must always be able to get in.
 */
export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

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

  const active = rows.filter((r) => r.isActive).length;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-8 flex items-center justify-between border-b border-line pb-4">
        <div>
          <Wordmark href="/admin" />
          <h1 className="mt-2 text-xl font-semibold">Account activation</h1>
          <p className="mt-1 text-sm text-ink-2">
            {rows.length} account{rows.length === 1 ? "" : "s"} · {active} active ·{" "}
            {rows.length - active} waiting
          </p>
        </div>
      </div>

      <UserTable
        initial={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
    </main>
  );
}
