"use client";

import { useEffect, useState } from "react";
import { EmptyState, Page, PageHeader } from "@/components/ui";

interface Entry {
  id: string;
  version: number;
  entity: string;
  changeKind: string;
  actor: string;
  createdAt: string;
}

const VERB: Record<string, string> = {
  create: "Added",
  update: "Updated",
  delete: "Removed",
  confirm: "Confirmed",
  reject: "Dismissed",
};
const ENTITY: Record<string, string> = {
  profile: "business profile",
  boundary: "a boundary",
  knowledge: "a knowledge item",
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => {
    fetch("/api/settings/audit")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <Page>
      <PageHeader
        title="Audit log"
        subtitle="A record of every important change to your Business Brain."
      />
      {rows === null ? (
        <div className="skeleton h-40 w-full" role="status" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <EmptyState title="No changes yet">
          Edits to your business profile, boundaries, and knowledge will appear here — who changed
          what, and when.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">
                {VERB[r.changeKind] ?? r.changeKind} {ENTITY[r.entity] ?? r.entity}
                <span className="ml-2 text-[12px] text-ink-3">
                  {r.actor.startsWith("user:") ? "by you" : `by ${r.actor}`}
                </span>
              </span>
              <span className="tnum shrink-0 text-[12px] text-ink-3">
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
