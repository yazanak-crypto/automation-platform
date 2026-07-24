"use client";

import { useCallback, useEffect, useState } from "react";
import { Page, PageHeader } from "@/components/ui";

interface Member { id: string; name: string | null; email: string; role: string }
interface Invite { id: string; email: string; role: string; createdAt: string }
interface Data { members: Member[]; invites: Invite[]; myRole: string | null; myUserId: string }

export default function TeamPage() {
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/team");
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => void load(), [load]);

  const canManage = data?.myRole === "owner" || data?.myRole === "admin";

  async function invite() {
    if (!email.trim()) return;
    setBusy(true); setErr(null); setMsg(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(body.error ?? "Couldn't send the invite.");
    setEmail("");
    setMsg(body.emailed ? "Invitation sent." : "Invite created — they can join by signing up with that email.");
    await load();
  }

  async function remove(q: string) {
    setErr(null);
    const res = await fetch(`/api/settings/team?${q}`, { method: "DELETE" });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Couldn't complete that.");
    await load();
  }

  return (
    <Page>
      <PageHeader title="Users & permissions" subtitle="Invite teammates and manage who can do what." />
      {!data ? (
        <div className="skeleton h-40 w-full" role="status" aria-label="Loading" />
      ) : (
        <div className="space-y-8">
          {canManage && (
            <div className="rounded-xl border border-line p-5">
              <p className="text-sm font-medium">Invite a teammate</p>
              <p className="mt-1 text-[13px] text-ink-2">
                They join your workspace when they sign up with this email.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@yourbusiness.com"
                  className="min-w-[220px] flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "member" | "admin")}
                  className="rounded-lg border border-line bg-raised px-3 py-2 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={invite}
                  disabled={busy || !email.trim()}
                  className="press-glow rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send invite"}
                </button>
              </div>
              {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}
              {err && <p className="mt-2 text-sm text-stop">{err}</p>}
              <p className="mt-3 text-[12px] text-ink-3">
                <strong>Admins</strong> can manage the team and settings. <strong>Members</strong> can
                handle conversations and drafts.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Team ({data.members.length})</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">
                    {m.name ?? m.email}
                    {m.id === data.myUserId && <span className="ml-2 text-[12px] text-ink-3">(you)</span>}
                    <span className="ml-2 block text-[12px] text-ink-3 sm:inline">{m.email}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium capitalize text-ink-2">
                      {m.role}
                    </span>
                    {canManage && m.role !== "owner" && m.id !== data.myUserId && (
                      <button
                        onClick={() => remove(`memberId=${m.id}`)}
                        className="text-xs text-ink-3 underline-offset-2 hover:text-stop hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {data.invites.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Pending invites ({data.invites.length})</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">
                      {i.email}
                      <span className="ml-2 text-[12px] text-ink-3 capitalize">· {i.role}</span>
                    </span>
                    {canManage && (
                      <button
                        onClick={() => remove(`inviteId=${i.id}`)}
                        className="text-xs text-ink-3 underline-offset-2 hover:text-stop hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
