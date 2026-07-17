import { aiCalls, db, workspaces } from "@platform/db";
import { desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const ws = await db()
      .select()
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt))
      .limit(50);
    const usage = await db()
      .select({
        workspaceId: aiCalls.workspaceId,
        calls: sql<number>`count(*)::int`,
        tokensIn: sql<number>`coalesce(sum(${aiCalls.tokensIn}), 0)::int`,
        tokensOut: sql<number>`coalesce(sum(${aiCalls.tokensOut}), 0)::int`,
        costMicrocents: sql<number>`coalesce(sum(${aiCalls.estimatedCostMicrocents}), 0)::int`,
      })
      .from(aiCalls)
      .groupBy(aiCalls.workspaceId);
    const recentErrors = await db()
      .select()
      .from(aiCalls)
      .where(eq(aiCalls.success, false))
      .orderBy(desc(aiCalls.createdAt))
      .limit(20);
    return { ws, usage, recentErrors, dbError: undefined };
  } catch (err) {
    return {
      ws: [],
      usage: [],
      recentErrors: [],
      dbError: err instanceof Error ? err.message : String(err),
    };
  }
}

function usd(microcents: number) {
  return `$${(microcents / 1e8).toFixed(4)}`;
}

export default async function InternalPage() {
  const { ws, usage, recentErrors, dbError } = await load();
  const usageByWs = new Map(usage.map((u) => [u.workspaceId, u]));

  return (
    <div className="space-y-10">
      {dbError && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          Database unavailable: {dbError}
        </p>
      )}

      <section>
        <h2 className="mb-3 font-medium">Workspaces ({ws.length})</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 pr-4">Name</th>
              <th className="py-1 pr-4">Plan</th>
              <th className="py-1 pr-4">Created</th>
              <th className="py-1 pr-4">AI calls</th>
              <th className="py-1 pr-4">Tokens in/out</th>
              <th className="py-1">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {ws.map((w) => {
              const u = usageByWs.get(w.id);
              return (
                <tr key={w.id} className="border-t border-neutral-800">
                  <td className="py-2 pr-4">{w.name}</td>
                  <td className="py-2 pr-4">{w.plan}</td>
                  <td className="py-2 pr-4">{w.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="py-2 pr-4">{u?.calls ?? 0}</td>
                  <td className="py-2 pr-4">
                    {u ? `${u.tokensIn} / ${u.tokensOut}` : "—"}
                  </td>
                  <td className="py-2">{u ? usd(u.costMicrocents) : "—"}</td>
                </tr>
              );
            })}
            {ws.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-neutral-500">
                  No workspaces yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Runs</h2>
        <p className="text-sm text-neutral-500">
          Runs ledger lands in M1 step 6 — this section will read from it.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Recent AI errors ({recentErrors.length})</h2>
        {recentErrors.length === 0 ? (
          <p className="text-sm text-neutral-500">None recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentErrors.map((c) => (
              <li key={c.id} className="rounded border border-neutral-800 p-3">
                <span className="text-neutral-500">
                  {c.createdAt.toISOString()} · {c.model} · {c.promptRef}
                </span>
                <div className="text-red-300">{c.errorSummary}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
