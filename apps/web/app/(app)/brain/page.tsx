"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Page, PageHeader, Skeleton } from "@/components/ui";

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
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none";
const labelCls = "mb-1 block text-sm text-ink-2";
const btnCls = "rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50";

// Audit P1-8: no user action may fail silently. api() reports every failure
// to the page banner (and still throws so callers stop).
let notifyError: (msg: string) => void = () => {};

async function api(path: string, method: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    notifyError("Network problem — check your connection and try again.");
    throw new Error("network");
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({} as { error?: unknown })))?.error;
    const msg = typeof detail === "string" ? detail : "That didn't save — please try again.";
    notifyError(msg);
    throw new Error(msg);
  }
  return res.json();
}

/** Wrap event handlers so the throw from api() never becomes an unhandled rejection. */
const safely = (fn: () => Promise<unknown>) => () => void fn().catch(() => {});

export default function BrainPage() {
  const [brain, setBrain] = useState<Brain | null>(null);
  const [tab, setTab] = useState<"profile" | "boundaries" | "knowledge">("profile");
  const [notice, setNotice] = useState<{ msg: string; kind: "ok" | "error" } | null>(null);

  const load = useCallback(
    async () => setBrain(await api("/api/brain", "GET").catch(() => null)),
    [],
  );
  useEffect(() => { void load(); }, [load]);

  function flash(msg: string) {
    setNotice({ msg, kind: "ok" });
    setTimeout(() => setNotice(null), 2500);
  }
  useEffect(() => {
    notifyError = (msg) => {
      setNotice({ msg, kind: "error" });
      setTimeout(() => setNotice(null), 4000);
    };
    return () => { notifyError = () => {}; };
  }, []);

  if (!brain) {
    return (
      <Page>
        <div className="space-y-4 pt-2" role="status" aria-label="Loading">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="mt-6 h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Page>
    );
  }

  const suggestedCount = brain.knowledge.filter((k) => k.status === "suggested").length;

  const confirmedFacts = brain.knowledge.filter((k) => k.status === "confirmed").length;
  const activeBoundaries = brain.boundaries.filter((b) => b.active).length;
  return (
    <Page>
      <PageHeader
        title="Business Brain"
        subtitle={
          <>
            Everything your AI knows and is allowed to say.{" "}
            <span className="tnum">{confirmedFacts}</span> confirmed fact{confirmedFacts === 1 ? "" : "s"} ·{" "}
            <span className="tnum">{activeBoundaries}</span> boundar{activeBoundaries === 1 ? "y" : "ies"} guarding replies
          </>
        }
        action={
          <Link
            href="/brain/setup"
            className="press-glow rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-hover"
          >
            Guided setup
          </Link>
        }
      />

      {/* The moment guided setup matters most is when there is nothing here.
          An empty Brain is why replies escalate instead of drafting, so this
          leads with the consequence rather than the feature. */}
      {confirmedFacts === 0 && (
        <div
          className="rise moment-glow mb-6 rounded-[14px] border p-5"
          style={{ borderColor: "var(--brass)", background: "var(--brass-dim)" }}
        >
          <p className="font-medium">Your AI doesn&apos;t know your business yet</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            With nothing confirmed here, every question gets brought to you instead of answered.
            The guided setup asks about a dozen questions tailored to your line of work — most
            people finish in about two minutes.
          </p>
          <Link
            href="/brain/setup"
            className="press-glow mt-3.5 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-transform active:scale-[0.97]"
          >
            Set up my Brain
          </Link>
        </div>
      )}

      <nav className="mb-6 flex gap-5 border-b border-line">
        {(["profile", "boundaries", "knowledge"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2.5 text-[13.5px] capitalize transition-colors ${tab === t ? "border-current font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2"}`}
          >
            {t}
            {t === "knowledge" && suggestedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-brass-dim px-1.5 text-[11px] font-medium text-brass">{suggestedCount}</span>
            )}
          </button>
        ))}
      </nav>

      {notice && (
        <p className={`mb-4 text-sm ${notice.kind === "ok" ? "text-ok" : "text-stop"}`}>
          {notice.msg}
        </p>
      )}

      {tab === "profile" && <ProfileTab brain={brain} setBrain={setBrain} onSaved={() => flash("Profile saved — active on the next AI run.")} />}
      {tab === "boundaries" && <BoundariesTab brain={brain} reload={load} onSaved={flash} />}
      {tab === "knowledge" && <KnowledgeTab brain={brain} setBrain={setBrain} reload={load} onSaved={flash} />}
    </Page>
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

      <button className={btnCls} disabled={saving} onClick={safely(save)}>{saving ? "Saving…" : "Save profile"}</button>
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
      <p className="text-sm text-ink-2">
        Hard rules the AI must never cross — e.g. &quot;Never offer discounts&quot;, &quot;Always hand off legal questions&quot;.
      </p>
      <div className="flex gap-2">
        <input className={inputCls} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Never promise specific delivery dates" />
        <select className="rounded-lg border border-line bg-raised px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="never_promise">never promise</option>
          <option value="never_offer">never offer</option>
          <option value="handoff">hand off</option>
          <option value="other">other</option>
        </select>
        <button className={btnCls} onClick={safely(add)}>Add</button>
      </div>
      <ul className="space-y-2">
        {brain.boundaries.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-line p-3">
            <div>
              <p className={`text-sm ${b.active ? "" : "text-ink-3 line-through"}`}>{b.ruleText}</p>
              <p className="text-xs text-ink-3">{b.category.replace("_", " ")}</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-hover px-2 py-1 text-xs"
                onClick={safely(async () => { await api(`/api/brain/boundaries/${b.id}`, "PATCH", { active: !b.active }); await reload(); })}>
                {b.active ? "Disable" : "Enable"}
              </button>
              <button className="rounded bg-stop-dim px-2 py-1 text-[11px] font-medium text-stop"
                onClick={safely(async () => { await api(`/api/brain/boundaries/${b.id}`, "DELETE"); await reload(); onSaved("Boundary removed."); })}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {brain.boundaries.length === 0 && <li className="text-sm text-ink-3">No boundaries yet — add your first rule above.</li>}
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
      <div className="rounded-lg border border-line p-4">
        <h3 className="mb-2 text-sm font-medium">Add an FAQ</h3>
        <div className="space-y-2">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question — e.g. Do you ship internationally?" />
          <textarea className={inputCls} rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="Answer" />
          <button className={btnCls} onClick={safely(addFaq)}>Add FAQ</button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["all", "suggested", "confirmed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs capitalize ${filter === f ? "bg-hover text-white" : "text-ink-2"}`}>
            {f}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {items.map((k) => (
          <li key={k.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {k.title}
                  {k.status === "suggested" && (
                    <span className="ml-2 rounded bg-brass-dim px-1.5 py-0.5 text-[11px] font-medium text-brass">suggested</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-ink-2">{k.content}</p>
                {k.sourceRef && <p className="mt-1 text-xs text-ink-3">from {k.sourceRef}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {k.status === "suggested" ? (
                  <>
                    <button onClick={safely(() => setStatus(k.id, "confirmed"))} className="rounded bg-ok-dim px-2 py-1 text-[11px] font-medium text-ok">Confirm</button>
                    <button onClick={safely(() => setStatus(k.id, "rejected"))} className="rounded bg-hover px-2 py-1 text-xs text-ink-2">Dismiss</button>
                  </>
                ) : (
                  <button onClick={safely(async () => { await api(`/api/brain/knowledge/${k.id}`, "DELETE"); await reload(); })} className="rounded bg-stop-dim px-2 py-1 text-[11px] font-medium text-stop">Delete</button>
                )}
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-ink-3">
            {filter === "suggested" ? "Nothing waiting for review." : "No knowledge yet — add your first FAQ above."}
          </li>
        )}
      </ul>
    </div>
  );
}
