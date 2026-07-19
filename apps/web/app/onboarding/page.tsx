"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "start" | "reading" | "review";

interface Brain {
  profile: {
    identity?: { businessName?: string; url?: string; industry?: string; description?: string; offerings?: string[] };
    voice?: { tone?: string[]; formality?: string };
    policies?: { shipping?: string; refunds?: string; pricing?: string; hours?: string };
    onboardingStatus: string;
  };
  knowledge: { id: string; kind: string; title: string; content: string; status: string; provenance: string }[];
}

const inputCls =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none";
const labelCls = "mb-1 block text-sm text-ink-2";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("Reading your site…");
  const [brain, setBrain] = useState<Brain | null>(null);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadBrain = useCallback(async () => {
    const res = await fetch("/api/brain");
    if (res.ok) setBrain(await res.json());
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function start() {
    setError(null);
    if (!url.trim()) {
      // No URL: manual path straight to review with an empty draft.
      if (name.trim()) {
        await fetch("/api/brain/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: { businessName: name.trim() } }),
        });
      }
      await loadBrain();
      setStep("review");
      return;
    }
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const res = await fetch("/api/brain/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalized }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't start reading that site.");
      return;
    }
    if (name.trim()) {
      await fetch("/api/brain/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: { businessName: name.trim() } }),
      });
    }
    const { jobId } = await res.json();
    setStep("reading");
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks++;
      if (ticks === 4) setProgress("Understanding your business…");
      if (ticks === 10) setProgress("Drafting your profile…");
      const st = await fetch(`/api/brain/ingest/${jobId}`);
      if (!st.ok) return;
      const data = await st.json();
      if (data.state === "completed" || data.state === "failed" || ticks > 45) {
        if (pollRef.current) clearInterval(pollRef.current);
        await loadBrain();
        setStep("review");
      }
    }, 2000);
  }

  async function skip() {
    await fetch("/api/brain/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingStatus: "skipped" }),
    });
    router.push("/dashboard");
  }

  async function confirm() {
    if (!brain) return;
    setSaving(true);
    await fetch("/api/brain/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: brain.profile.identity ?? {},
        voice: brain.profile.voice ?? {},
        policies: brain.profile.policies ?? {},
        onboardingStatus: "confirmed",
      }),
    });
    router.push("/dashboard");
  }

  async function reviewItem(id: string, status: "confirmed" | "rejected") {
    await fetch(`/api/brain/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBrain((b) =>
      b ? { ...b, knowledge: b.knowledge.map((k) => (k.id === id ? { ...k, status } : k)) } : b,
    );
  }

  const setIdentity = (patch: Record<string, unknown>) =>
    setBrain((b) =>
      b ? { ...b, profile: { ...b.profile, identity: { ...b.profile.identity, ...patch } } } : b,
    );

  if (step === "start") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold">Tell us about your business</h1>
          <p className="mt-1 text-sm text-ink-2">
            We&apos;ll read your website and set things up for you.
          </p>
        </div>
        <div>
          <label className={labelCls}>Business name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" />
        </div>
        <div>
          <label className={labelCls}>Website (optional)</label>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://acme.com" />
        </div>
        {error && <p className="text-sm text-stop">{error}</p>}
        <button onClick={start} className="rounded-lg bg-white py-2.5 font-medium text-black">
          Continue
        </button>
        <button onClick={skip} className="text-sm text-ink-3 hover:text-ink-2">
          Skip for now
        </button>
      </main>
    );
  }

  if (step === "reading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-white" />
        <p className="text-ink-2">{progress}</p>
        <p className="text-sm text-ink-3">Usually under a minute.</p>
      </main>
    );
  }

  const identity = brain?.profile.identity ?? {};
  const suggested = brain?.knowledge.filter((k) => k.status === "suggested") ?? [];
  const sparseDraft = !identity.industry && !identity.description && suggested.length === 0;

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Here&apos;s what we learned about your business</h1>
        {sparseDraft && (
          <p className="mt-2 rounded-lg border border-line bg-raised p-3 text-sm text-ink-2">
            We couldn&apos;t read much from your site — no problem. Fill in what matters below;
            two sentences about what you do is plenty to start.
          </p>
        )}
        <p className="mt-1 text-sm text-ink-2">
          Everything below is a draft — review and adjust before confirming. Fields marked{" "}
          <span className="rounded bg-brass-dim px-1.5 py-0.5 text-[11px] font-medium text-brass">AI</span> were
          inferred from your website.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <label className={labelCls}>Business name</label>
          <input className={inputCls} value={identity.businessName ?? ""} onChange={(e) => setIdentity({ businessName: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Industry {identity.industry && <AiBadge />}</label>
          <input className={inputCls} value={identity.industry ?? ""} onChange={(e) => setIdentity({ industry: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>What you do {identity.description && <AiBadge />}</label>
          <textarea className={inputCls} rows={4} value={identity.description ?? ""} onChange={(e) => setIdentity({ description: e.target.value })} />
        </div>
      </section>

      {suggested.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">
            Suggested knowledge <span className="text-sm text-ink-3">— confirm what&apos;s right</span>
          </h2>
          <ul className="space-y-2">
            {suggested.map((k) => (
              <li key={k.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{k.title}</p>
                    <p className="mt-1 text-sm text-ink-2">{k.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => reviewItem(k.id, "confirmed")} className="rounded bg-ok-dim px-2 py-1 text-[11px] font-medium text-ok">
                      Confirm
                    </button>
                    <button onClick={() => reviewItem(k.id, "rejected")} className="rounded bg-hover px-2 py-1 text-xs text-ink-2">
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-4">
        <button disabled={saving} onClick={confirm} className="rounded-lg bg-white px-5 py-2.5 font-medium text-black disabled:opacity-50">
          {saving ? "Saving…" : "Looks right →"}
        </button>
        <button onClick={skip} className="text-sm text-ink-3 hover:text-ink-2">
          Finish later
        </button>
      </div>
    </main>
  );
}

function AiBadge() {
  return <span className="ml-1 rounded bg-brass-dim px-1.5 py-0.5 text-[11px] font-medium text-brass">AI</span>;
}
