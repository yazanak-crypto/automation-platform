"use client";

import { useCallback, useEffect, useState } from "react";

interface Boundary {
  id: string;
  ruleText: string;
  category: string;
  active: boolean;
}
interface Knowledge {
  id: string;
  kind: string;
  title: string;
  content: string;
  status: string;
  provenance: string;
  sourceRef?: string | null;
}
interface Brain {
  profile: {
    identity?: Record<string, unknown> & { businessName?: string; url?: string; industry?: string; description?: string };
    voice?: { tone?: string[]; formality?: string; signOff?: string; bannedPhrases?: string[] };
    policies?: { shipping?: string; refunds?: string; pricing?: string; hours?: string };
    onboardingStatus: string;
    brainVersion: number;
  };
  boundaries: Boundary[];
  knowledge: Knowledge[];
}

const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none";
const labelCls = "mb-1 block text-sm text-neutral-400";
const btnCls = "rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Request failed");
  return res.json();
}

export default function BrainPage() {
  const [brain, setBrain] = useState<Brain | null>(null);
  const [tab, setTab] = useState<"profile" | "boundaries" | "knowledge">("profile");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => setBrain(await api("/api/brain", "GET")), []);
  useEffect(() => { void load(); }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  if (!brain) {
    return <main className="p-8 text-neutral-500">Loading your Business Brain…</main>;
  }

  const suggestedCount = brain.knowledge.filter((k) => k.status === "suggested").length;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Business Brain</h1>
        <p className="mt-1 text-sm text-neutral-400">
          What the platform knows about your business. Every automation uses this.
          <span className="ml-2 text-neutral-600">v{brain.profile.brainVersion}</span>
        </p>
      </header>

      <nav className="mb-6 flex gap-2 border-b border-neutral-800 pb-2">
        {(["profile", "boundaries", "knowledge"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === t ? "bg-neutral-800 text-white" : "text-neutral-400"}`}
          >
            {t}
            {t === "knowledge" && suggestedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-indigo-900 px-1.5 text-xs text-indigo-300">{suggestedCount}</span>
            )}
          </button>
        ))}
      </nav>

      {notice && <p className="mb-4 text-sm text-emerald-400">{notice}</p>}

      {tab === "profile" && <ProfileTab brain={brain} setBrain={setBrain} onSaved={() => flash("Profile saved — active on the next AI run.")} />}
      {tab === "boundaries" && <BoundariesTab brain={brain} reload={load} onSaved={flash} />}
      {tab === "knowledge" && <KnowledgeTab brain={brain} setBrain={setBrain} reload={load} onSaved={flash} />}
    </main>
  );
}

function ProfileTab({
  brain,
  setBrain,
  onSaved,
}: {
  brain: Brain;
  setBrain: (fn: (b: Brain | null) => Brain | null) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const p = brain.profile;
  const set = (section: "identity" | "voice" | "policies", patch: Record<string, unknown>) =>
    setBrain((b) =>
      b ? { ...b, profile: { ...b.profile, [section]: { ...(b.profile[section] ?? {}), ...patch } } } : b,
    );

  async function save() {
    setSaving(true);
    try {
      const res = await api("/api/brain/profile", "PATCH", {
        identity: p.identity ?? {},
        voice: p.voice ?? {},
        policies: p.policies ?? {},
      });
      setBrain((b) => (b ? { ...b, profile: { ...b.profile, brainVersion: res.brainVersion } } : b));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-medium">Identity</h2>
        <div><label className={labelCls}>Business name</label>
          <input className={inputCls} value={p.identity?.businessName ?? ""} onChange={(e) => set("identity", { businessName: e.target.value })} /></div>
        <div><label className={labelCls}>Website</label>
          <input className={inputCls} value={p.identity?.url ?? ""} onChange={(e) => set("identity", { url: e.target.value })} /></div>
        <div><label className={labelCls}>Industry</label>
          <input className={inputCls} value={p.identity?.industry ?? ""} onChange={(e) => set("identity", { industry: e.target.value })} /></div>
        <div><label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={4} value={p.identity?.description ?? ""} onChange={(e) => set("identity", { description: e.target.value })} /></div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Voice</h2>
        <div><label className={labelCls}>Tone (comma-separated, e.g. friendly, direct)</label>
          <input className={inputCls} value={(p.voice?.tone ?? []).join(", ")}
            onChange={(e) => set("voice", { tone: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
        <div><label className={labelCls}>Sign-off</label>
          <input className={inputCls} value={p.voice?.signOff ?? ""} onChange={(e) => set("voice", { signOff: e.target.value })} /></div>
        <div><label className={labelCls}>Phrases to never use (comma-separated)</label>
          <input className={inputCls} value={(p.voice?.bannedPhrases ?? []).join(", ")}
            onChange={(e) => set("voice", { bannedPhrases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Policies</h2>
        {(["shipping", "refunds", "pricing", "hours"] as const).map((k) => (
          <div key={k}><label className={`${labelCls} capitalize`}>{k}</label>
            <textarea className={inputCls} rows={2} value={p.policies?.[k] ?? ""} onChange={(e) => set("policies", { [k]: e.target.value })} /></div>
        ))}
      </section>

      <button className={btnCls} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save profile"}</button>
    </div>
  );
}

function BoundariesTab({ brain, reload, onSaved }: { brain: Brain; reload: () => Promise<void>; onSaved: (m: string) => void }) {
  const [rule, setRule] = useState("");
  const [category, setCategory] = useState("other");

  async function add() {
    if (rule.trim().length < 3) return;
    await api("/api/brain/boundaries", "POST", { ruleText: rule.trim(), category, active: true });
    setRule("");
    await reload();
    onSaved("Boundary added.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Hard rules the AI must never cross — e.g. &quot;Never offer discounts&quot;, &quot;Always hand off legal questions&quot;.
      </p>
      <div className="flex gap-2">
        <input className={inputCls} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Never promise specific delivery dates" />
        <select className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="never_promise">never promise</option>
          <option value="never_offer">never offer</option>
          <option value="handoff">hand off</option>
          <option value="other">other</option>
        </select>
        <button className={btnCls} onClick={add}>Add</button>
      </div>
      <ul className="space-y-2">
        {brain.boundaries.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-neutral-800 p-3">
            <div>
              <p className={`text-sm ${b.active ? "" : "text-neutral-500 line-through"}`}>{b.ruleText}</p>
              <p className="text-xs text-neutral-500">{b.category.replace("_", " ")}</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-neutral-800 px-2 py-1 text-xs"
                onClick={async () => { await api(`/api/brain/boundaries/${b.id}`, "PATCH", { active: !b.active }); await reload(); }}>
                {b.active ? "Disable" : "Enable"}
              </button>
              <button className="rounded bg-red-950/60 px-2 py-1 text-xs text-red-300"
                onClick={async () => { await api(`/api/brain/boundaries/${b.id}`, "DELETE"); await reload(); onSaved("Boundary removed."); }}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {brain.boundaries.length === 0 && <li className="text-sm text-neutral-500">No boundaries yet — add your first rule above.</li>}
      </ul>
    </div>
  );
}

function KnowledgeTab({
  brain, setBrain, reload, onSaved,
}: {
  brain: Brain;
  setBrain: (fn: (b: Brain | null) => Brain | null) => void;
  reload: () => Promise<void>;
  onSaved: (m: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "suggested" | "confirmed">("all");
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const items = brain.knowledge.filter(
    (k) => k.status !== "rejected" && (filter === "all" || k.status === filter),
  );

  async function addFaq() {
    if (!q.trim() || !a.trim()) return;
    await api("/api/brain/knowledge", "POST", { kind: "faq", title: q.trim(), content: a.trim() });
    setQ(""); setA("");
    await reload();
    onSaved("FAQ added.");
  }

  async function setStatus(id: string, status: "confirmed" | "rejected") {
    await api(`/api/brain/knowledge/${id}`, "PATCH", { status });
    setBrain((b) => (b ? { ...b, knowledge: b.knowledge.map((k) => (k.id === id ? { ...k, status } : k)) } : b));
    onSaved(status === "confirmed" ? "Confirmed — the AI can now use this." : "Dismissed.");
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-800 p-4">
        <h3 className="mb-2 text-sm font-medium">Add an FAQ</h3>
        <div className="space-y-2">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question — e.g. Do you ship internationally?" />
          <textarea className={inputCls} rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="Answer" />
          <button className={btnCls} onClick={addFaq}>Add FAQ</button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["all", "suggested", "confirmed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs capitalize ${filter === f ? "bg-neutral-800 text-white" : "text-neutral-400"}`}>
            {f}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {items.map((k) => (
          <li key={k.id} className="rounded-lg border border-neutral-800 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {k.title}
                  {k.status === "suggested" && (
                    <span className="ml-2 rounded bg-indigo-950 px-1.5 py-0.5 text-xs text-indigo-300">suggested</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-neutral-400">{k.content}</p>
                {k.sourceRef && <p className="mt-1 text-xs text-neutral-600">from {k.sourceRef}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {k.status === "suggested" ? (
                  <>
                    <button onClick={() => setStatus(k.id, "confirmed")} className="rounded bg-emerald-900/60 px-2 py-1 text-xs text-emerald-300">Confirm</button>
                    <button onClick={() => setStatus(k.id, "rejected")} className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400">Dismiss</button>
                  </>
                ) : (
                  <button onClick={async () => { await api(`/api/brain/knowledge/${k.id}`, "DELETE"); await reload(); }} className="rounded bg-red-950/60 px-2 py-1 text-xs text-red-300">Delete</button>
                )}
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-neutral-500">
            {filter === "suggested" ? "Nothing waiting for review." : "No knowledge yet — add your first FAQ above."}
          </li>
        )}
      </ul>
    </div>
  );
}
