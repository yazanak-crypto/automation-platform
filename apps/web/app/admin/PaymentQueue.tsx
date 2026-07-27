"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ClaimedPayment {
  id: string;
  plan: string;
  amountUsd: number;
  method: string;
  referenceCode: string;
  claimedReference: string;
  screenshot: string | null;
  createdAt: string;
  workspaceName: string;
  userEmail: string;
}

export default function PaymentQueue({ initial }: { initial: ClaimedPayment[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function review(paymentId: string, action: "confirm" | "reject", noteText?: string) {
    setBusy(paymentId);
    setError(null);
    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, paymentId, ...(noteText ? { note: noteText } : {}) }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't update that payment.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== paymentId));
    setRejecting(null);
    setNote("");
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ink-2">No payments awaiting review.</p>;
  }

  return (
    <>
      {error && <p className="mb-3 text-sm text-stop">{error}</p>}
      <ul className="space-y-3">
        {rows.map((r) => {
          const mismatch =
            r.claimedReference.toUpperCase().replace(/\s/g, "") ===
            r.referenceCode.toUpperCase().replace(/\s/g, "");
          return (
            <li key={r.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.workspaceName}{" "}
                    <span className="font-normal text-ink-3">· {r.userEmail}</span>
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    <span className="capitalize">{r.plan}</span> · ${r.amountUsd} fresh USD ·{" "}
                    {r.method} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-ink-3">
                    expected {r.referenceCode} · they sent {r.claimedReference}
                    {mismatch && <span className="ml-2 text-ok">matches</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    disabled={busy === r.id}
                    onClick={() => review(r.id, "confirm")}
                    className="press-glow rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busy === r.id}
                    onClick={() => setRejecting(rejecting === r.id ? null : r.id)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:text-stop disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>

              {r.screenshot && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12.5px] text-ink-3">
                    View receipt screenshot
                  </summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.screenshot}
                    alt="Payment receipt"
                    className="mt-2 max-h-96 rounded-lg border border-line"
                  />
                </details>
              )}

              {rejecting === r.id && (
                <div className="mt-3 rounded-lg bg-raised p-3">
                  <label className="block text-[12.5px] font-medium">
                    Why are you rejecting this? (required — it revokes their access)
                  </label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="e.g. No transfer received with this reference"
                    className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
                  />
                  <button
                    disabled={note.trim().length < 3 || busy === r.id}
                    onClick={() => review(r.id, "reject", note.trim())}
                    className="mt-2 rounded-lg bg-stop px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                  >
                    Confirm rejection
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
