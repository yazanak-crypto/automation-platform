"use client";

import { useCallback, useEffect, useState } from "react";

interface Channel {
  id: string;
  type: string;
  connectionId?: string | null;
  displayName: string;
  widgetKey: string;
  status: string;
  config: { allowedOrigins?: string[]; connectedAt?: string; webhookSubscribed?: boolean };
  lastBlockedOrigin?: string | null;
}

const inputCls =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [origins, setOrigins] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/channels").catch(() => null);
    if (res?.ok) {
      setChannels(await res.json());
      setLoadFailed(false);
      return;
    }
    // Never leave the page on a permanent skeleton: if we have nothing to show,
    // surface a retry instead. An already-loaded list stays on screen so a blip
    // in the 5s poll doesn't wipe the page.
    setChannels((prev) => prev ?? []);
    setLoadFailed(true);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000); // live "connected ✓" check
    return () => clearInterval(t);
  }, [load]);

  async function createChannel() {
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "web_chat",
        displayName: "Website chat",
        allowedOrigins: origins.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    setCreating(false);
    if (!res?.ok) {
      setCreateError("We couldn't set up website chat just now. Please try again.");
      return;
    }
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

      {loadFailed && (
        <div className="mt-4 rounded-lg border border-line border-l-2 border-l-wait bg-raised p-4">
          <p className="text-sm text-ink-2">We couldn&apos;t load your channels just now.</p>
          <button
            onClick={() => void load()}
            className="press-glow mt-3 rounded-lg bg-white px-3.5 py-1.5 text-[13px] font-medium text-black transition-transform active:scale-[0.97]"
          >
            Try again
          </button>
        </div>
      )}

      {/* Website chat first: it's the only channel that works with no external
          account, so it must not sit below the roadmap grid. */}
      {channels === null ? (
        <div className="mt-8 space-y-4" role="status" aria-label="Loading"><div className="skeleton h-32 w-full" /></div>
      ) : !webchat ? (
        <div className="mt-8 rounded-xl border border-line p-6">
          <h2 className="font-medium">Website chat</h2>
          <p className="mt-1 text-sm text-ink-2">
            A chat bubble on your website. Visitors ask; AI drafts replies from your Business
            Brain; nothing sends without your approval. No other account needed.
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
          {createError && <p className="mt-3 text-sm text-stop">{createError}</p>}
          <button
            onClick={createChannel}
            disabled={creating}
            className="press-glow mt-4 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {creating ? "Setting up…" : "Set up website chat"}
          </button>
        </div>
      ) : (
        <WebchatCard channel={webchat} onSaveOrigins={saveOrigins} />
      )}

      <EmailSection channels={channels ?? []} reload={load} />

      <InstagramSection channels={channels ?? []} reload={load} />

      <Ecosystem />
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
            className="press-glow shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Connecting…" : emails.length > 0 ? "Connect another" : "Connect Gmail"}
          </button>
        ) : (
          <span className="text-xs text-ink-3">Email setup is being finalized — available shortly</span>
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
        Credentials are kept in a secure vault — we never store your password. Disconnect anytime from your
        Google account settings.
      </p>
    </div>
  );
}

function InstagramSection({
  channels,
  reload,
}: {
  channels: Channel[];
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accounts = channels.filter((c) => c.type === "instagram" && c.status === "active");
  const nangoKey = process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const ws = await fetch("/api/workspace").then((r) => r.json());
      const { default: Nango } = await import("@nangohq/frontend");
      const nango = new Nango({ publicKey: nangoKey! });
      const connectionId = `ws-${ws.id}-${crypto.randomUUID().slice(0, 8)}`;
      await nango.auth("instagram", connectionId);
      const res = await fetch("/api/connections/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nangoConnectionId: connectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      // Honest partial state: connected but webhook subscription didn't take.
      if (data.warning) setError(data.warning);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Instagram connection didn't complete.");
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup(ch: Channel) {
    if (!ch.connectionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${ch.connectionId}/subscribe`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't finish setup");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't finish setup.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(ch: Channel) {
    if (!ch.connectionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${ch.connectionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Disconnect failed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-line p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Instagram (Business)</h2>
          <p className="mt-1 text-sm text-ink-2">
            Your AI reads incoming Instagram DMs and drafts replies — same approval flow, same
            autonomy rules as website chat and email.
          </p>
        </div>
        {nangoKey ? (
          <button
            onClick={connect}
            disabled={busy}
            className="press-glow shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Working…" : accounts.length > 0 ? "Connect another" : "Connect Instagram"}
          </button>
        ) : (
          <span className="text-xs text-ink-3">Instagram setup is being finalized — available shortly</span>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-stop">{error}</p>}

      {accounts.length === 0 && nangoKey && (
        <details className="mt-4 rounded-lg border border-line bg-raised p-4 text-sm">
          <summary className="cursor-pointer font-medium">Before you connect — 30-second checklist</summary>
          <p className="mt-2 text-ink-2">
            Instagram only lets apps read DMs for <strong>Business</strong> or{" "}
            <strong>Professional</strong> accounts that are linked to a Facebook Page. Most issues
            come from a missing step here — check these first:
          </p>
          <ol className="mt-3 space-y-3">
            <li>
              <p className="font-medium">1. Make your account Business or Professional</p>
              <p className="text-ink-2">
                In the Instagram app: Settings → Account type and tools → Switch to professional
                account. It&apos;s free and keeps your username.
              </p>
            </li>
            <li>
              <p className="font-medium">2. Link a Facebook Page</p>
              <p className="text-ink-2">
                Instagram app → Edit profile → Page → connect or create a Facebook Page. This is
                what lets your AI read and reply to DMs.
              </p>
            </li>
            <li>
              <p className="font-medium">3. Come back and press Connect Instagram</p>
              <p className="text-ink-2">
                You&apos;ll sign in with Instagram and approve access. We&apos;ll confirm it worked.
              </p>
            </li>
          </ol>
        </details>
      )}

      {accounts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {accounts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-line px-4 py-2.5"
            >
              <span className="text-sm">{c.displayName}</span>
              <span className="flex items-center gap-3">
                {c.config.webhookSubscribed ? (
                  <span className="rounded-full bg-ok-dim px-2 py-0.5 text-[11px] font-medium text-ok">
                    ● Watching DMs
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-wait">
                      Setup incomplete
                    </span>
                    <button
                      onClick={() => finishSetup(c)}
                      disabled={busy}
                      className="press-glow rounded-lg bg-white px-3 py-1 text-xs font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-50"
                    >
                      Finish setup
                    </button>
                  </>
                )}
                <button
                  onClick={() => disconnect(c)}
                  disabled={busy}
                  className="text-xs text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline disabled:opacity-50"
                >
                  Disconnect
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Requires an Instagram Business or Professional account. Your login is kept in a secure vault
        — we never see or store your password.
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
  const [method, setMethod] = useState<"shopify" | "wordpress" | "gtm" | "developer">("shopify");
  const snippet = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js" data-key="${channel.widgetKey}" async></script>`;

  const GUIDES: Record<typeof method, { label: string; steps: string[] }> = {
    shopify: {
      label: "Shopify",
      steps: [
        "In Shopify admin, go to Online Store → Themes → ⋯ → Edit code.",
        "Open theme.liquid and find the </body> tag near the bottom.",
        "Paste the code on the line just above </body>, then Save.",
      ],
    },
    wordpress: {
      label: "WordPress",
      steps: [
        "In your WordPress dashboard, install the free “WPCode” plugin (or use your theme’s footer settings).",
        "Add a new snippet set to run site-wide in the footer.",
        "Paste the code, then Save and activate.",
      ],
    },
    gtm: {
      label: "Google Tag Manager",
      steps: [
        "In Tag Manager, create a new Tag → Custom HTML.",
        "Paste the code, set the trigger to “All Pages”.",
        "Save and press Submit to publish.",
      ],
    },
    developer: {
      label: "Email my web person",
      steps: ["We’ll open a pre-written email with the code and instructions — just add their address and send."],
    },
  };
  const guide = GUIDES[method];
  const devMailto = `mailto:?subject=${encodeURIComponent("Please add our website chat")}&body=${encodeURIComponent(
    `Hi,\n\nPlease add this code to our website, on every page, just before the </body> tag:\n\n${snippet}\n\nThat installs our AI chat assistant. Thank you!`,
  )}`;

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
        <p className="text-sm text-ink-2">
          This adds a small chat bubble to your website. Visitors ask a question; your AI drafts a
          reply from your Business Brain; nothing sends without your approval. Pick where your site
          is built and follow the steps:
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(GUIDES) as (typeof method)[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                method === m ? "border-line-strong bg-raised" : "border-line text-ink-2 hover:text-ink"
              }`}
            >
              {GUIDES[m].label}
            </button>
          ))}
        </div>

        <ol className="mt-3 space-y-1.5 text-sm text-ink-2">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ink-3">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <div className="mt-3 flex items-center gap-2">
          <code className="block flex-1 overflow-x-auto rounded-lg bg-raised p-3 text-xs text-ink-2">
            {snippet}
          </code>
          {method === "developer" ? (
            <a
              href={devMailto}
              className="whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs font-medium text-black"
            >
              Open email
            </a>
          ) : (
            <button
              className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black"
              onClick={async () => {
                await navigator.clipboard.writeText(snippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied ✓" : "Copy code"}
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-ink-3">
          {channel.config.connectedAt
            ? "✓ We’ve seen your chat widget go live on your site."
            : "Once it’s installed, this page updates to “Widget connected” automatically — we’ll check your site for you."}
        </p>
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
            className="press-glow rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-transform active:scale-[0.97]"
            onClick={() => onSaveOrigins(channel, origins)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const ECOSYSTEM: { name: string; live?: boolean }[] = [
  { name: "Website Chat", live: true },
  { name: "Email · Gmail", live: true },
  { name: "Instagram", live: true },
  { name: "WhatsApp" },
  { name: "Facebook Messenger" },
  { name: "Telegram" },
  { name: "SMS" },
  { name: "Voice" },
  { name: "Slack" },
  { name: "Google Business" },
  { name: "Outlook" },
  { name: "Shopify" },
  { name: "Stripe" },
  { name: "Calendly" },
  { name: "Google Calendar" },
  { name: "HubSpot" },
  { name: "Salesforce" },
  { name: "Zapier" },
  { name: "Webhook" },
  { name: "API" },
];

function Ecosystem() {
  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
          The Ovanth ecosystem
        </h2>
        <span className="text-[12px] text-ink-3">3 live · more every month</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {ECOSYSTEM.map((c) => (
          <div
            key={c.name}
            className={`flex items-center justify-between rounded-[10px] border border-line p-3.5 ${c.live ? "bg-raised" : ""}`}
          >
            <span className={`text-[13px] font-medium ${c.live ? "" : "text-ink-2"}`}>{c.name}</span>
            {c.live ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-dim px-2 py-0.5 text-[10.5px] font-medium text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> live
              </span>
            ) : (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("ovanth:help-open"))}
                className="press-glow rounded-full border border-line px-2.5 py-0.5 text-[10.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
              >
                Request
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        Website chat, email, and Instagram are live today. Tell us which integration you need next — we
        prioritize the roadmap by demand.
      </p>
    </section>
  );
}
