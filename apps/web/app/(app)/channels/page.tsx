"use client";

import { useCallback, useEffect, useState } from "react";

interface Channel {
  id: string;
  type: string;
  displayName: string;
  widgetKey: string;
  status: string;
  config: { allowedOrigins?: string[]; connectedAt?: string };
  lastBlockedOrigin?: string | null;
}

const inputCls =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [origins, setOrigins] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/channels");
    if (res.ok) setChannels(await res.json());
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000); // live "connected ✓" check
    return () => clearInterval(t);
  }, [load]);

  async function createChannel() {
    await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "web_chat",
        displayName: "Website chat",
        allowedOrigins: origins.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    await load();
  }

  async function saveOrigins(ch: Channel, value: string) {
    await fetch(`/api/channels/${ch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowedOrigins: value.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    await load();
    setNotice("Allowed sites saved.");
    setTimeout(() => setNotice(null), 2000);
  }

  const webchat = channels?.find((c) => c.type === "web_chat");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Channels</h1>
      <p className="mt-1 text-sm text-ink-2">Where customers reach you.</p>
      {notice && <p className="mt-3 text-sm text-ok">{notice}</p>}

      <EmailSection channels={channels ?? []} reload={load} />

      {channels === null ? (
        <div className="mt-8 space-y-4" role="status" aria-label="Loading"><div className="skeleton h-32 w-full" /></div>
      ) : !webchat ? (
        <div className="mt-8 rounded-xl border border-line p-6">
          <h2 className="font-medium">Website chat</h2>
          <p className="mt-1 text-sm text-ink-2">
            A chat bubble on your website. Visitors ask; AI drafts replies from your Business
            Brain; nothing sends without your approval.
          </p>
          <label className="mt-4 block text-sm text-ink-2">
            Your website (where the widget will live)
          </label>
          <input
            className={`${inputCls} mt-1`}
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder="https://acme.com"
          />
          <button
            onClick={createChannel}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Set up website chat
          </button>
        </div>
      ) : (
        <WebchatCard channel={webchat} onSaveOrigins={saveOrigins} />
      )}
    </main>
  );
}

function EmailSection({ channels, reload }: { channels: Channel[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emails = channels.filter((c) => c.type === "email");
  const nangoKey = process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const ws = await fetch("/api/workspace").then((r) => r.json());
      const { default: Nango } = await import("@nangohq/frontend");
      const nango = new Nango({ publicKey: nangoKey! });
      const connectionId = `ws-${ws.id}-${crypto.randomUUID().slice(0, 8)}`;
      await nango.auth("google-mail", connectionId);
      const res = await fetch("/api/connections/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nangoConnectionId: connectionId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Connection failed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gmail connection didn't complete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-line p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Email (Gmail)</h2>
          <p className="mt-1 text-sm text-ink-2">
            Your AI reads incoming email and drafts replies — same approval flow, same autonomy
            rules as website chat.
          </p>
        </div>
        {nangoKey ? (
          <button
            onClick={connect}
            disabled={busy}
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy ? "Connecting…" : emails.length > 0 ? "Connect another" : "Connect Gmail"}
          </button>
        ) : (
          <span className="text-xs text-ink-3">Email connections not configured yet</span>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-stop">{error}</p>}
      {emails.length > 0 && (
        <ul className="mt-4 space-y-2">
          {emails.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg border border-line px-4 py-2.5">
              <span className="text-sm">{c.displayName}</span>
              <span className="rounded-full bg-ok-dim px-2 py-0.5 text-[11px] font-medium text-ok">
                {c.status === "active" ? "● Watching inbox" : c.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Credentials are held by our OAuth vault, never stored by us. Disconnect anytime from your
        Google account settings.
      </p>
    </div>
  );
}

function WebchatCard({
  channel,
  onSaveOrigins,
}: {
  channel: Channel;
  onSaveOrigins: (ch: Channel, value: string) => Promise<void>;
}) {
  const [origins, setOrigins] = useState((channel.config.allowedOrigins ?? []).join(", "));
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js" data-key="${channel.widgetKey}" async></script>`;

  return (
    <div className="mt-8 space-y-6 rounded-xl border border-line p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{channel.displayName}</h2>
        {channel.config.connectedAt ? (
          <span className="rounded-full bg-ok-dim px-2.5 py-1 text-[11px] font-medium text-ok">
            ● Widget connected
          </span>
        ) : (
          <span className="rounded-full bg-hover px-2.5 py-1 text-xs text-ink-2">
            Waiting for first visitor…
          </span>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm text-ink-2">
          Paste this before <code>&lt;/body&gt;</code> on your site:
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 overflow-x-auto rounded-lg bg-raised p-3 text-xs text-ink-2">
            {snippet}
          </code>
          <button
            className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>

      {channel.lastBlockedOrigin && (
        <div className="rounded-lg border border-line border-l-2 border-l-wait bg-raised p-3 text-sm">
          <p className="text-wait">
            A widget tried to connect from <code>{channel.lastBlockedOrigin}</code> but that site
            isn&apos;t on your allowed list.
          </p>
          <p className="mt-1 text-xs text-ink-2">
            If that&apos;s your site, add it below and save. If you don&apos;t recognize it, you can
            ignore this.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-ink-2">
          Allowed sites (comma-separated — only these can use your widget)
        </label>
        <div className="flex gap-2">
          <input className={inputCls} value={origins} onChange={(e) => setOrigins(e.target.value)} />
          <button
            className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black"
            onClick={() => onSaveOrigins(channel, origins)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
