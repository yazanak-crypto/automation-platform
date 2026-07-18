"use client";

import { use, useCallback, useEffect, useState } from "react";

interface Msg {
  id: string;
  direction: string;
  body: string;
  aiGenerated: boolean;
  draftStatus: string;
  createdAt: string;
}
interface RunEvent { id: string; kind: string; title: string; detail?: Record<string, unknown> }
interface Run { id: string; kind: string; status: string; events: RunEvent[] }
interface Detail {
  conversation: { id: string; status: string; channelName: string; priorConversations: number };
  messages: Msg[];
  runs: Run[];
  latestDraftCall: { brainVersion?: number; model?: string } | null;
}

export default function ConversationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [showWhy, setShowWhy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <main className="p-8 text-neutral-500">Loading…</main>;

  const pending = data.messages.find((m) => m.draftStatus === "pending_approval");
  const visible = data.messages.filter((m) => m.draftStatus !== "dismissed" && m.id !== pending?.id);
  const lastRun = data.runs[0];

  async function act(action: "approve" | "dismiss") {
    await fetch(`/api/conversations/${id}/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(action === "approve" && edit !== null ? { editedBody: edit } : {}),
      }),
    });
    setEdit(null);
    await load();
  }

  async function sendManual() {
    if (!reply.trim()) return;
    await fetch(`/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply.trim() }),
    });
    setReply("");
    await load();
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Conversation</h1>
          <p className="text-sm text-neutral-500">
            {data.conversation.channelName}
            {data.conversation.priorConversations > 0 &&
              ` · conversation ${data.conversation.priorConversations + 1} with this visitor`}
            {data.conversation.status === "closed" && " · closed"}
          </p>
        </div>
        {data.conversation.status !== "closed" && (
          <button
            onClick={async () => {
              await fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "closed" }),
              });
              await load();
            }}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400"
          >
            Close conversation
          </button>
        )}
      </header>

      <div className="space-y-3">
        {visible.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "inbound" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.direction === "inbound" ? "bg-neutral-800" : "bg-indigo-950 text-indigo-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.aiGenerated && <p className="mt-1 text-xs opacity-60">AI · approved by you</p>}
            </div>
          </div>
        ))}
      </div>

      {pending && (
        <div className="mt-6 rounded-xl border border-amber-900 bg-amber-950/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-400">
            AI draft — waiting for your approval
          </p>
          {edit === null ? (
            <p className="mt-2 whitespace-pre-wrap text-sm">{pending.body}</p>
          ) : (
            <textarea
              className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm"
              rows={4}
              value={edit}
              onChange={(e) => setEdit(e.target.value)}
            />
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => act("approve")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white">
              {edit !== null ? "Approve edited" : "Approve & send"}
            </button>
            {edit === null ? (
              <button onClick={() => setEdit(pending.body)} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs">
                Edit
              </button>
            ) : (
              <button onClick={() => setEdit(null)} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs">
                Cancel edit
              </button>
            )}
            <button onClick={() => act("dismiss")} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400">
              Dismiss
            </button>
            <button onClick={() => setShowWhy(!showWhy)} className="ml-auto text-xs text-neutral-400 underline underline-offset-2">
              Why this reply?
            </button>
          </div>
        </div>
      )}

      {showWhy && lastRun && (
        <div className="mt-3 rounded-xl border border-neutral-800 p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            What the AI did
            {data.latestDraftCall?.brainVersion != null &&
              ` · brain v${data.latestDraftCall.brainVersion}`}
          </p>
          <ol className="space-y-1.5">
            {lastRun.events.map((e) => (
              <li key={e.id} className="text-neutral-300">
                <span className={e.kind === "error" ? "text-red-400" : ""}>{e.title}</span>
                {e.detail?.usedFacts != null && (e.detail.usedFacts as string[]).length > 0 && (
                  <span className="text-neutral-500"> — used: {(e.detail.usedFacts as string[]).join(", ")}</span>
                )}
                {typeof e.detail?.reasoning === "string" && (
                  <p className="text-xs text-neutral-500">{e.detail.reasoning}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
          placeholder="Write a reply yourself…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendManual()}
        />
        <button onClick={sendManual} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
          Send
        </button>
      </div>
    </main>
  );
}
