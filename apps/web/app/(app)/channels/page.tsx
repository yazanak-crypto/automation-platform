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
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none";

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
      <p className="mt-1 text-sm text-neutral-400">Where customers reach you.</p>
      {notice && <p className="mt-3 text-sm text-emerald-400">{notice}</p>}

      {channels === null ? (
        <p className="mt-8 text-neutral-500">Loading…</p>
      ) : !webchat ? (
        <div className="mt-8 rounded-xl border border-neutral-800 p-6">
          <h2 className="font-medium">Website chat</h2>
          <p className="mt-1 text-sm text-neutral-400">
            A chat bubble on your website. Visitors ask; AI drafts replies from your Business
            Brain; nothing sends without your approval.
          </p>
          <label className="mt-4 block text-sm text-neutral-400">
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
    <div className="mt-8 space-y-6 rounded-xl border border-neutral-800 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{channel.displayName}</h2>
        {channel.config.connectedAt ? (
          <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-xs text-emerald-300">
            ● Widget connected
          </span>
        ) : (
          <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400">
            Waiting for first visitor…
          </span>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm text-neutral-400">
          Paste this before <code>&lt;/body&gt;</code> on your site:
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-300">
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
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm">
          <p className="text-amber-300">
            A widget tried to connect from <code>{channel.lastBlockedOrigin}</code> but that site
            isn&apos;t on your allowed list.
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            If that&apos;s your site, add it below and save. If you don&apos;t recognize it, you can
            ignore this.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-neutral-400">
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
