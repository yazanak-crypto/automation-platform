"use client";

import { useState } from "react";

interface Row {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function UserTable({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(row: Row) {
    setBusy(row.id);
    setError(null);
    const next = !row.isActive;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: row.id, isActive: next }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError("Couldn't update that account. Try again.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)));
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ink-2">No accounts yet.</p>;
  }

  return (
    <>
      {error && <p className="mb-3 text-sm text-stop">{error}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.email}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {r.name ? `${r.name} · ` : ""}signed up{" "}
                {new Date(r.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  r.isActive ? "bg-ok-dim text-ok" : "bg-hover text-ink-3"
                }`}
              >
                {r.isActive ? "Active" : "Waiting"}
              </span>
              <button
                role="switch"
                aria-checked={r.isActive}
                aria-label={`${r.isActive ? "Deactivate" : "Activate"} ${r.email}`}
                disabled={busy === r.id}
                onClick={() => toggle(r)}
                className={`h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  r.isActive ? "bg-ok" : "bg-hover"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                    r.isActive ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
