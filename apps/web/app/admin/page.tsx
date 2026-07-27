import { notFound } from "next/navigation";
import { db, users } from "@platform/db";
import { listClaimedPayments, listReviewedPayments } from "@platform/core";
import { desc } from "drizzle-orm";
import { Wordmark } from "@/components/wordmark";
import { isAdmin } from "@/lib/admin";
import PaymentQueue from "./PaymentQueue";
import UserTable from "./UserTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

/**
 * Operator console. Gated by a single Clerk user id (ADMIN_USER_ID). Lives
 * outside the (app) group so it's never caught by any app-level redirect.
 */
export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

  const [rows, claimed, reviewed] = await Promise.all([
    db()
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    listClaimedPayments(),
    listReviewedPayments(),
  ]);

  const active = rows.filter((r) => r.isActive).length;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-8 border-b border-line pb-4">
        <Wordmark href="/admin" />
        <h1 className="mt-2 text-xl font-semibold">Admin</h1>
      </div>

      {/* Payments needing review — the thing that costs money if ignored. */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-medium">Payments to review</h2>
          <span className="tnum text-[12px] text-ink-3">{claimed.length} waiting</span>
        </div>
        <PaymentQueue
          initial={claimed.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
        />
      </section>

      {reviewed.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-medium">Recently reviewed</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {reviewed.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 text-[13px]">
                  <span className="truncate">{p.workspaceName}</span>
                  <span className="ml-2 text-ink-3">
                    {p.plan} · ${p.amountUsd}
                  </span>
                  {p.reviewNote && (
                    <span className="mt-0.5 block text-[12px] text-ink-3">{p.reviewNote}</span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.status === "CONFIRMED" ? "bg-ok-dim text-ok" : "bg-stop-dim text-stop"
                  }`}
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-medium">Accounts</h2>
          <span className="tnum text-[12px] text-ink-3">
            {rows.length} total · {active} active
          </span>
        </div>
        <p className="mb-3 text-[12.5px] text-ink-3">
          The active flag isn&apos;t enforced anywhere — everyone gets access on signup. It stays
          here so an account can be flagged manually if needed.
        </p>
        <UserTable initial={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
      </section>
    </main>
  );
}
