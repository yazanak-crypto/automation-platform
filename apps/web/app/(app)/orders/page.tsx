"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, InlineError, Page, PageHeader, RelativeTime, SkeletonRows } from "@/components/ui";

// The Orders tab. Rows carry the customer and the date; the decision dialogs
// carry the exact message that will be sent.

type Status = "pending" | "confirmed" | "cancelled" | "fulfilled";

interface Row {
  id: string;
  status: Status;
  customerName: string | null;
  contactName: string | null;
  requestedForText: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionNotifiedAt: string | null;
  decisionNotifyError: string | null;
  pendingReason: string | null;
  items: string[];
}

interface Detail {
  summary: string;
  defaultMessages: { confirm: string; cancel: string };
}

const FILTERS: { id: string; label: string }[] = [
  { id: "pending", label: "Needs you" },
  { id: "confirmed", label: "Confirmed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const STATUS_STYLE: Record<Status, string> = {
  pending: "bg-wait-dim text-wait",
  confirmed: "bg-ok-dim text-ok",
  cancelled: "bg-hover text-ink-3",
  fulfilled: "bg-ok-dim text-ok",
};

export default function OrdersPage() {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Kept SEPARATE from `error` on purpose.
   *
   * load() clears `error` on every successful refresh, and the decision flow
   * refreshes immediately after deciding — so a "customer was not notified"
   * warning stored in `error` was set and then wiped in the same tick. The
   * owner saw nothing and would reasonably assume the message went out. This
   * one is cleared only by the next decision.
   */
  const [notice, setNotice] = useState<string | null>(null);

  // The open decision dialog. `message` is seeded from the SERVER's render and
  // is what gets posted back — so what the owner reads is what is sent.
  const [dialog, setDialog] = useState<
    { order: Row; action: "confirm" | "cancel"; message: string; busy: boolean } | null
  >(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders?status=${filter}`).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't load orders.");
      return;
    }
    setError(null);
    setRows((await res.json()).orders as Row[]);
  }, [filter]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  /**
   * Fetch the server's rendered message BEFORE opening the dialog.
   *
   * Deliberately not composed here. If the client built its own preview, the
   * text the owner approved and the text the server sent would be two separate
   * renders, free to drift apart with any copy change.
   */
  async function openDialog(order: Row, action: "confirm" | "cancel") {
    setError(null);
    const res = await fetch(`/api/orders/${order.id}`).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't prepare the message — please try again.");
      return;
    }
    const detail = (await res.json()) as Detail;
    setDialog({ order, action, message: detail.defaultMessages[action], busy: false });
  }

  async function submit() {
    if (!dialog) return;
    setNotice(null);
    setDialog({ ...dialog, busy: true });
    const res = await fetch(`/api/orders/${dialog.order.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sent verbatim — edited or not.
      body: JSON.stringify({ action: dialog.action, message: dialog.message }),
    }).catch(() => null);

    if (!res?.ok) {
      setError("That didn't go through — the order is unchanged.");
      setDialog({ ...dialog, busy: false });
      return;
    }
    const result = (await res.json()) as { notified: boolean; notifyError?: string };
    setDialog(null);
    // The decision stuck but the customer was NOT reached. Said plainly rather
    // than left for the owner to assume it went out.
    if (!result.notified) {
      setNotice(
        `Order ${dialog.action === "confirm" ? "confirmed" : "cancelled"}, but the message did not reach the customer${
          result.notifyError ? ` — ${result.notifyError}` : ""
        }. They have not been told.`,
      );
    }
    await load();
  }

  return (
    <Page>
      <PageHeader
        title="Orders"
        subtitle="Captured from your conversations. Nothing is confirmed until you confirm it."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              filter === f.id ? "bg-hover text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <InlineError>{error}</InlineError>

      {/* The decision stuck, the notification did not. Survives the refresh
          that follows a decision; the affected row carries the same fact
          persistently, from the order itself. */}
      {notice && (
        <div className="mb-4 rounded-[10px] border border-line border-l-2 border-l-stop bg-raised p-3">
          <p className="text-[13px] text-stop">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="mt-1 text-[12px] text-ink-3 underline underline-offset-4 hover:text-ink-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {rows === null ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">
          No orders here yet. When a customer commits to something in a conversation, it lands in
          this tab for you to confirm.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => {
            const notifyFailed = !!o.decidedAt && !o.decisionNotifiedAt;
            return (
              <div key={o.id} className="rise rounded-[10px] border border-line bg-raised p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium" dir="auto">
                    {o.customerName || o.contactName || "Unknown customer"}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[o.status]}`}
                    >
                      {o.status}
                    </span>
                    <span className="text-[12px] text-ink-3">
                      <RelativeTime value={o.createdAt} />
                    </span>
                  </div>
                </div>

                <p className="mt-1.5 text-[13px] text-ink-2" dir="auto">
                  {o.items.join(", ") || "No items"}
                  {o.requestedForText ? ` · for ${o.requestedForText}` : ""}
                </p>

                {/* Why is this still waiting? Answered from the row, the same
                    way a waiting draft explains itself. */}
                {o.status === "pending" && o.pendingReason && (
                  <p className="mt-1 text-[12px] text-ink-3">{o.pendingReason}</p>
                )}

                {/* The mismatch: decided, but the customer was never told. */}
                {notifyFailed && (
                  <p className="mt-2 rounded-md border border-l-2 border-line border-l-stop px-2 py-1.5 text-[12px] text-stop">
                    The customer was NOT notified
                    {o.decisionNotifyError ? ` — ${o.decisionNotifyError}` : ""}. Reply in the
                    conversation to tell them yourself.
                  </p>
                )}

                {o.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ok" size="sm" onClick={() => void openDialog(o, "confirm")}>
                      Confirm
                    </Button>
                    <Button size="sm" onClick={() => void openDialog(o, "cancel")}>
                      Cancel order
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[12px] border border-line bg-bg p-5">
            <p className="text-sm font-medium">
              {dialog.action === "confirm" ? "Confirm this order" : "Cancel this order"}
            </p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              This message will be sent to the customer exactly as it appears here. Edit it if you
              want to say something different.
            </p>

            <textarea
              value={dialog.message}
              onChange={(e) => setDialog({ ...dialog, message: e.target.value })}
              rows={4}
              dir="auto"
              className="mt-3 w-full rounded-lg border border-line bg-bg p-3 text-sm leading-relaxed focus:border-line-strong focus:outline-none"
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant={dialog.action === "confirm" ? "ok" : undefined}
                size="sm"
                onClick={() => void submit()}
                disabled={dialog.busy || !dialog.message.trim()}
              >
                {dialog.busy
                  ? "Sending…"
                  : dialog.action === "confirm"
                    ? "Confirm & send"
                    : "Cancel & send"}
              </Button>
              <button
                onClick={() => setDialog(null)}
                disabled={dialog.busy}
                className="text-sm text-ink-3 hover:text-ink-2 disabled:opacity-40"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
