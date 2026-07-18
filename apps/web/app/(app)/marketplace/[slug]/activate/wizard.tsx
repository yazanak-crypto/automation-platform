"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "textarea";
  placeholder?: string;
  help?: string;
}
interface Channel {
  id: string;
  type: string;
  displayName: string;
  status: string;
  config: { connectedAt?: string };
}
interface Preview {
  reply: string;
  category: string;
  reasoning: string;
  usedFacts: string[];
  needsHuman: boolean;
}

const STEPS = ["Connect", "Configure", "Preview", "Go live"] as const;
const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none";

export default function ActivateWizard({
  slug,
  name,
  configFields,
  sampleMessages,
}: {
  slug: string;
  name: string;
  configFields: ConfigField[];
  sampleMessages: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [sample, setSample] = useState(sampleMessages[0] ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"supervised" | "smart">("supervised");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const rows: Channel[] = await res.json();
        const webchat = rows.filter((c) => c.status === "active");
        setChannels(webchat);
        if (webchat.length === 1) setSelected([webchat[0]!.id]);
      }
    })();
  }, []);

  async function runPreview() {
    setBusy(true);
    setError(null);
    setPreview(null);
    const res = await fetch("/api/marketplace/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, config, sampleMessage: sample }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Preview failed");
      return;
    }
    setPreview(await res.json());
  }

  async function goLive() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/activations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automationSlug: slug, config, channelIds: selected, mode }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Activation failed");
      return;
    }
    router.push("/dashboard?activated=1");
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <p className="text-sm text-neutral-500">Activating</p>
      <h1 className="text-2xl font-semibold">{name}</h1>

      <ol className="mt-6 flex gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs ${
              i === step
                ? "bg-white font-medium text-black"
                : i < step
                  ? "bg-emerald-950 text-emerald-300"
                  : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {i < step ? "✓ " : ""}{s}
          </li>
        ))}
      </ol>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {step === 0 && (
        <section className="mt-8">
          <h2 className="font-medium">Where should it listen?</h2>
          {channels === null ? (
            <p className="mt-3 text-sm text-neutral-500">Loading channels…</p>
          ) : channels.length === 0 ? (
            <div className="mt-3 rounded-xl border border-neutral-800 p-4">
              <p className="text-sm text-neutral-400">
                You don&apos;t have a website chat channel yet — it takes about two minutes.
              </p>
              <Link
                href="/channels"
                className="mt-3 inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
              >
                Set up website chat
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {channels.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-800 p-4 has-[:checked]:border-neutral-400">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <div>
                      <p className="text-sm font-medium">{c.displayName}</p>
                      <p className="text-xs text-neutral-500">
                        {c.type === "email"
                          ? "Inbox checked every couple of minutes"
                          : c.config.connectedAt
                            ? "Widget connected ✓"
                            : "Widget not seen yet"}
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button
            disabled={selected.length === 0}
            onClick={() => setStep(1)}
            className="mt-6 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40"
          >
            Continue
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="mt-8 space-y-4">
          <h2 className="font-medium">Make it yours</h2>
          <p className="text-sm text-neutral-500">
            Your Business Brain already covers your voice, policies and FAQs — these settings are
            specific to this automation. All optional.
          </p>
          {configFields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm text-neutral-400">{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  className={inputCls}
                  rows={2}
                  placeholder={f.placeholder}
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  className={inputCls}
                  placeholder={f.placeholder}
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              )}
              {f.help && <p className="mt-1 text-xs text-neutral-500">{f.help}</p>}
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="text-sm text-neutral-500">← Back</button>
            <button
              onClick={() => setStep(2)}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8">
          <h2 className="font-medium">See it work — before it goes live</h2>
          <p className="mt-1 text-sm text-neutral-500">
            This runs the real automation on a sample message, using your actual Business Brain.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sampleMessages.map((m) => (
              <button
                key={m}
                onClick={() => setSample(m)}
                className={`rounded-full px-3 py-1 text-xs ${sample === m ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"}`}
              >
                {m.slice(0, 40)}…
              </button>
            ))}
          </div>
          <textarea
            className={`${inputCls} mt-3`}
            rows={2}
            value={sample}
            onChange={(e) => setSample(e.target.value)}
          />
          <button
            disabled={busy || !sample.trim()}
            onClick={runPreview}
            className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy ? "Thinking…" : "Preview the AI's reply"}
          </button>

          {preview && (
            <div className="mt-4 rounded-xl border border-indigo-900 bg-indigo-950/20 p-4">
              {preview.reply ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">
                    The reply your visitor would see (after your approval)
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{preview.reply}</p>
                </>
              ) : (
                <p className="text-sm text-neutral-300">
                  The AI would hand this one to you personally rather than draft a reply.
                </p>
              )}
              <p className="mt-3 text-xs text-neutral-500">
                {preview.reasoning}
                {preview.usedFacts.length > 0 && ` — used: ${preview.usedFacts.join(", ")}`}
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep(1)} className="text-sm text-neutral-500">← Back</button>
            <button
              disabled={!preview}
              onClick={() => setStep(3)}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40"
            >
              Looks good — continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-8">
          <h2 className="font-medium">Choose how it starts</h2>
          <div className="mt-4 space-y-2">
            <label className={`block cursor-pointer rounded-xl border p-4 ${mode === "supervised" ? "border-neutral-300" : "border-neutral-800"}`}>
              <input type="radio" className="mr-2" checked={mode === "supervised"} onChange={() => setMode("supervised")} />
              <span className="text-sm font-medium">Supervised — recommended to start</span>
              <p className="mt-1 text-xs text-neutral-500">
                Every reply waits for your approval. Your AI earns autonomy as you approve its
                work — we&apos;ll show you when it&apos;s ready for more.
              </p>
            </label>
            <label className={`block cursor-pointer rounded-xl border p-4 ${mode === "smart" ? "border-neutral-300" : "border-neutral-800"}`}>
              <input type="radio" className="mr-2" checked={mode === "smart"} onChange={() => setMode("smart")} />
              <span className="text-sm font-medium">Smart Automation — handle routine questions instantly</span>
              <p className="mt-1 text-xs text-neutral-500">
                Low-risk questions backed by your confirmed Business Brain are answered
                automatically. Refunds, complaints and anything unclear still come to you.
              </p>
            </label>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-neutral-300">
            <li>✓ Listening on {selected.length} channel{selected.length === 1 ? "" : "s"}</li>
            <li>✓ Replies in your voice, from your Business Brain</li>
            <li>
              ✓ <span className="font-medium">{mode === "supervised" ? "Nothing is ever sent without your approval" : "High-risk conversations always come to you"}</span>
            </li>
          </ul>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep(2)} className="text-sm text-neutral-500">← Back</button>
            <button
              disabled={busy}
              onClick={goLive}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Activating…" : "Go live"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
