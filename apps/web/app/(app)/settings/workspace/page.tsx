"use client";

import { useCallback, useEffect, useState } from "react";
import { Page, PageHeader } from "@/components/ui";

export default function WorkspaceSettingsPage() {
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspace");
    if (res.ok) setName((await res.json()).name ?? "");
    setLoaded(true);
  }, []);
  useEffect(() => void load(), [load]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  }

  return (
    <Page>
      <PageHeader title="Workspace" subtitle="Your business's name and workspace details." />
      {!loaded ? (
        <div className="skeleton h-24 w-full" role="status" aria-label="Loading" />
      ) : (
        <div className="rounded-xl border border-line p-5">
          <label className="block text-sm font-medium">Business name</label>
          <p className="mt-1 text-[13px] text-ink-2">
            Shown across your dashboard and used when your AI refers to your business.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
            />
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="press-glow shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {saved && <p className="mt-2 text-sm text-ok">Saved.</p>}
        </div>
      )}
    </Page>
  );
}
