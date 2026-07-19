"use client";

import { use, useCallback, useEffect, useState } from "react";
import {
  Button,
  InlineError,
  Page,
  PageHeader,
  RelativeTime,
  Skeleton,
} from "@/components/ui";

interface Msg {
  id: string;
  direction: string;
  body: string;
  aiGenerated: boolean;
  draftStatus: string;
  deliveryState?: string | null;
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
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/conversations/${id}`).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [id]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <Page>
        <div className="space-y-4 pt-4" role="status" aria-label="Loading conversation">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-16 w-3/5" />
          <Skeleton className="ml-auto h-16 w-3/5" />
          <Skeleton className="h-16 w-2/5" />
        </div>
      </Page>
    );
  }

  const pending = data.messages.find((m) => m.draftStatus === "pending_approval");
  const visible = data.messages.filter((m) => m.draftStatus !== "dismissed" && m.id !== pending?.id);
  const lastRun = data.runs[0];

  async function act(action: "approve" | "dismiss") {
    setActionError(null);
    const res = await fetch(`/api/conversations/${id}/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(action === "approve" && edit !== null ? { editedBody: edit } : {}),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setActionError("That didn't go through — please try again.");
      return;
    }
    setEdit(null);
    await load();
  }

  async function sendManual() {
    if (!reply.trim()) return;
    setActionError(null);
    const res = await fetch(`/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply.trim() }),
    }).catch(() => null);
    if (!res?.ok) {
      setActionError("Your reply didn't send — please try again.");
      return;
    }
    setReply("");
    await load();
  }

  return (
    <Page>
      <PageHeader
        back={{ href: "/conversations", label: "Conversations" }}
        title="Conversation"
        subtitle={
          <>
            {data.conversation.channelName}
            {data.conversation.priorConversations > 0 &&
              ` · conversation ${data.conversation.priorConversations + 1} with this customer`}
            {data.conversation.status === "closed" && " · closed"}
          </>
        }
        action={
          data.conversation.status !== "closed" ? (
            <Button
              size="sm"
              onClick={async () => {
                await fetch(`/api/conversations/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "closed" }),
                }).catch(() => null);
                await load();
              }}
            >
              Close conversation
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {visible.map((m) => {
          const mine = m.direction !== "inbound";
          return (
            <div key={m.id} className={`rise flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[82%] rounded-[14px] px-4 py-2.5 text-sm leading-relaxed ${
                  mine ? "bg-hover" : "border border-line bg-raised"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
              <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
                {m.aiGenerated && (
                  <span className={m.draftStatus === "auto_sent" ? "text-ok" : ""}>
                    {m.draftStatus === "auto_sent" ? "AI · sent automatically" : "AI · approved by you"}
                  </span>
                )}
                {m.deliveryState === "failed" && <span className="text-stop">· failed to send</span>}
                {m.aiGenerated && <span>·</span>}
                <RelativeTime value={m.createdAt} />
              </div>
            </div>
          );
        })}
      </div>

      <InlineError>{actionError}</InlineError>

      {pending && (
        <div className="rise mt-6 rounded-[10px] border border-line border-l-2 border-l-wait bg-raised p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-wait">
              Draft — waiting for your approval
            </p>
            <RelativeTime value={pending.createdAt} />
          </div>
          {edit === null ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{pending.body}</p>
          ) : (
            <textarea
              className="mt-2 w-full rounded-lg border border-line bg-bg p-3 text-sm leading-relaxed focus:border-line-strong focus:outline-none"
              rows={4}
              value={edit}
              onChange={(e) => setEdit(e.target.value)}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ok" size="sm" onClick={() => act("approve")}>
              {edit !== null ? "Approve edited" : "Approve & send"}
            </Button>
            {edit === null ? (
              <Button size="sm" onClick={() => setEdit(pending.body)}>Edit</Button>
            ) : (
              <Button size="sm" onClick={() => setEdit(null)}>Cancel edit</Button>
            )}
            <Button size="sm" onClick={() => act("dismiss")}>Dismiss</Button>
            <button
              onClick={() => setShowWhy(!showWhy)}
              className="ml-auto text-[12.5px] text-ink-3 underline underline-offset-4 transition-colors hover:text-ink-2"
            >
              Why this reply?
            </button>
          </div>
        </div>
      )}

      {showWhy && lastRun && (
        <div className="rise mt-3 rounded-[10px] border border-line p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
            What your AI did
          </p>
          <ol className="space-y-0">
            {lastRun.events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < lastRun.events.length - 1 && (
                  <span className="absolute left-[3.5px] top-3 h-full w-px bg-line" />
                )}
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      e.kind === "error"
                        ? "var(--stop)"
                        : e.kind === "decision"
                          ? "var(--brass)"
                          : "var(--line-strong)",
                  }}
                />
                <div className="min-w-0">
                  <p className={`text-[13.5px] ${e.kind === "error" ? "text-stop" : ""}`}>{e.title}</p>
                  {e.detail?.usedFacts != null && (e.detail.usedFacts as string[]).length > 0 && (
                    <p className="text-[12px] text-ink-3">
                      Used: {(e.detail.usedFacts as string[]).join(", ")}
                    </p>
                  )}
                  {typeof e.detail?.reasoning === "string" && (
                    <p className="text-[12px] leading-relaxed text-ink-3">{e.detail.reasoning}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-line bg-raised px-3.5 py-2.5 text-sm placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
          placeholder="Write a reply yourself…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendManual()}
        />
        <Button variant="primary" onClick={sendManual}>Send</Button>
      </div>
    </Page>
  );
}
