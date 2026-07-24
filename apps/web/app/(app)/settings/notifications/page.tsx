"use client";

import { useCallback, useEffect, useState } from "react";
import { Page, PageHeader } from "@/components/ui";

export default function NotificationSettingsPage() {
  const [draftEmails, setDraftEmails] = useState(true);
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/notifications");
    if (res.ok) {
      const d = await res.json();
      setDraftEmails(d.draftEmails);
      setEmail(d.email ?? "");
    }
    setLoaded(true);
  }, []);
  useEffect(() => void load(), [load]);

  async function save(patch: { draftEmails?: boolean; email?: string }) {
    setSaved(false);
    const res = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const d = await res.json();
      setDraftEmails(d.draftEmails);
      setEmail(d.email ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Notifications"
        subtitle="Get an email the moment a customer reply needs your approval — so you never keep anyone waiting."
      />
      {!loaded ? (
        <div className="skeleton h-24 w-full" role="status" aria-label="Loading" />
      ) : (
        <div className="space-y-6">
          <label className="flex items-start justify-between gap-4 rounded-xl border border-line p-5">
            <span>
              <span className="block text-sm font-medium">Email me when a reply needs approval</span>
              <span className="mt-1 block text-[13px] text-ink-2">
                While your AI is in training, every reply waits for you. We&apos;ll email you the
                customer&apos;s message and the suggested reply with a one-click approve link.
              </span>
            </span>
            <button
              role="switch"
              aria-checked={draftEmails}
              onClick={() => save({ draftEmails: !draftEmails })}
              className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${draftEmails ? "bg-ok" : "bg-hover"}`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition-transform ${draftEmails ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </label>

          <div className="rounded-xl border border-line p-5">
            <label className="block text-sm font-medium">Send alerts to</label>
            <p className="mt-1 text-[13px] text-ink-2">
              Leave blank to use your account email. Change it to send alerts somewhere else.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
              />
              <button
                onClick={() => save({ email })}
                className="press-glow shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97]"
              >
                Save
              </button>
            </div>
          </div>

          {saved && <p className="text-sm text-ok">Saved.</p>}
        </div>
      )}
    </Page>
  );
}
