"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[13.5px]">{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

export default function CheckoutForm({
  plan,
  monthlyUsd,
  setupFeeUsd,
  totalUsd,
  referenceCode,
  bankName,
  bankAccountName,
  bankIban,
  whishNumber,
  grantsProvisional,
  provisionalDays,
}: {
  plan: string;
  monthlyUsd: number;
  setupFeeUsd: number;
  totalUsd: number;
  referenceCode: string;
  bankName: string;
  bankAccountName: string;
  bankIban: string;
  whishNumber: string;
  grantsProvisional: boolean;
  provisionalDays: number;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"BANK" | "WHISH">(bankIban ? "BANK" : "WHISH");
  const [claimedReference, setClaimedReference] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is over 2MB — please attach a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(typeof reader.result === "string" ? reader.result : null);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!claimedReference.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, method, claimedReference: claimedReference.trim(), screenshot }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't submit — please try again.");
      return;
    }
    router.push("/dashboard?payment=submitted");
  }

  return (
    <>
      <section className="mt-6 rounded-xl border border-line p-5">
        <p className="font-medium">Send ${totalUsd} fresh USD</p>
        {setupFeeUsd > 0 ? (
          <p className="mt-1 text-[13px] text-ink-2">
            ${monthlyUsd} monthly + ${setupFeeUsd} setup = <strong className="text-ink">${totalUsd}</strong>.
            The setup fee is one time — future months are ${monthlyUsd}.
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-ink-2">
            ${monthlyUsd} for the month. Your setup fee was already paid.
          </p>
        )}
        <p className="mt-1 text-[13px] text-ink-2">
          Include the reference code below so we can match your transfer to your account.
        </p>

        <div className="mt-4 flex gap-2">
          {bankIban && (
            <button
              type="button"
              onClick={() => setMethod("BANK")}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                method === "BANK" ? "border-line-strong bg-raised" : "border-line text-ink-2"
              }`}
            >
              Bank transfer
            </button>
          )}
          {whishNumber && (
            <button
              type="button"
              onClick={() => setMethod("WHISH")}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                method === "WHISH" ? "border-line-strong bg-raised" : "border-line text-ink-2"
              }`}
            >
              Whish
            </button>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-raised px-4 py-1">
          {method === "BANK" ? (
            <>
              <CopyRow label="Bank" value={bankName} />
              <CopyRow label="Account name" value={bankAccountName} />
              <CopyRow label="IBAN" value={bankIban} />
            </>
          ) : (
            <CopyRow label="Whish number" value={whishNumber} />
          )}
          <CopyRow label="Amount" value={`${totalUsd} USD`} />
          <CopyRow label="Reference code" value={referenceCode} />
        </div>
      </section>

      <form onSubmit={submit} className="mt-6 rounded-xl border border-line p-5">
        <p className="font-medium">I&apos;ve sent the payment</p>
        <p className="mt-1 text-[13px] text-ink-2">
          {grantsProvisional
            ? `Your account switches on right away for ${provisionalDays} days while we confirm the transfer.`
            : "We'll switch your account on as soon as we've confirmed this transfer."}
        </p>

        <label className="mt-4 block text-[13px] font-medium">
          Reference number from your transfer
        </label>
        <input
          value={claimedReference}
          onChange={(e) => setClaimedReference(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. TRX-88421990"
          className="mt-1.5 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
        />

        <label className="mt-4 block text-[13px] font-medium">
          Screenshot of the receipt <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={onFile}
          className="mt-1.5 block w-full text-[12.5px] text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-raised file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink-2"
        />
        {fileName && <p className="mt-1 text-[12px] text-ok">Attached: {fileName}</p>}

        {error && <p className="mt-3 text-sm text-stop">{error}</p>}

        <button
          type="submit"
          disabled={busy || !claimedReference.trim()}
          className="press-glow mt-5 w-full rounded-lg bg-white py-2.5 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
        >
          {busy ? "Submitting…" : "I've sent the payment"}
        </button>
      </form>
    </>
  );
}
