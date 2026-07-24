import { db, notifications, users, workspaceMembers, workspaces } from "@platform/db";
import { and, eq } from "drizzle-orm";

// Owner notifications (Priority 2). A small provider abstraction so email today
// and SMS/push later are the same shape. Nothing here throws into the caller —
// a failed notification must never break the run that triggered it.

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface NotificationProvider {
  readonly name: string;
  readonly configured: boolean;
  send(email: OutboundEmail): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Email via Resend's REST API — called with fetch so we add no SDK dependency.
 * Disabled (configured=false) until RESEND_API_KEY + NOTIFICATIONS_FROM_EMAIL
 * are set, exactly like the other optional integrations.
 */
class ResendEmailProvider implements NotificationProvider {
  readonly name = "resend";
  get configured(): boolean {
    return !!(process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_FROM_EMAIL);
  }
  async send(email: OutboundEmail): Promise<{ ok: boolean; error?: string }> {
    if (!this.configured) return { ok: false, error: "email provider not configured" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.NOTIFICATIONS_FROM_EMAIL,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `resend ${res.status} ${detail.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "email send failed" };
    }
  }
}

export const emailProvider: NotificationProvider = new ResendEmailProvider();

export function notificationsConfigured(): boolean {
  return emailProvider.configured;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Owner's email — recipient override wins, else the workspace owner's address. */
async function resolveRecipient(
  workspaceId: string,
  override?: string,
): Promise<string | null> {
  if (override) return override;
  const rows = await db()
    .select({ email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")))
    .limit(1);
  return rows[0]?.email ?? null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pure, unit-tested: the approval email body from a customer message + draft. */
export function renderDraftApprovalEmail(args: {
  customerMessage: string;
  suggestedReply: string;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "New customer message needs your approval";
  const text = [
    "A customer messaged you and your AI drafted a reply. It won't send until you approve it.",
    "",
    `Customer said:\n${args.customerMessage}`,
    "",
    `Your AI suggests:\n${args.suggestedReply}`,
    "",
    `Review & approve: ${args.reviewUrl}`,
  ].join("\n");
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <p style="font-size:15px;line-height:1.5">A customer messaged you and your AI drafted a reply. It won't send until you approve it.</p>
    <div style="background:#f6f6f7;border-radius:12px;padding:14px 16px;margin:16px 0">
      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.04em">Customer said</p>
      <p style="margin:0;font-size:14px;line-height:1.5">${esc(args.customerMessage)}</p>
    </div>
    <div style="border:1px solid #e6e6e8;border-radius:12px;padding:14px 16px;margin:16px 0">
      <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.04em">Your AI suggests</p>
      <p style="margin:0;font-size:14px;line-height:1.5">${esc(args.suggestedReply)}</p>
    </div>
    <a href="${esc(args.reviewUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600">Review &amp; approve</a>
    <p style="font-size:12px;color:#999;margin-top:20px">You're getting this because your AI is in supervised mode. You can turn these emails off in Settings → Notifications.</p>
  </div>`;
  return { subject, html, text };
}

export type NotifyResult = "sent" | "duplicate" | "disabled" | "skipped" | "failed";

/**
 * Notify the owner that an AI draft is waiting for approval. Idempotent on the
 * triggering message id — a retried job never emails twice. Never throws.
 */
export async function notifyDraftAwaitingApproval(args: {
  workspaceId: string;
  conversationId: string;
  triggerMessageId: string;
  customerMessage: string;
  suggestedReply: string;
}): Promise<NotifyResult> {
  try {
    const ws = await db()
      .select({ settings: workspaces.notificationSettings })
      .from(workspaces)
      .where(eq(workspaces.id, args.workspaceId))
      .limit(1);
    const settings = ws[0]?.settings ?? null;
    if (settings?.draftEmails === false) {
      await record(args.workspaceId, args.triggerMessageId, "skipped", "draft emails disabled");
      return "disabled";
    }

    // Claim the dedupe slot first: if the row already exists, we've notified.
    const claimed = await db()
      .insert(notifications)
      .values({
        workspaceId: args.workspaceId,
        type: "draft_approval",
        dedupeKey: args.triggerMessageId,
        channel: "email",
        status: "skipped", // provisional; updated below
        detail: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!claimed[0]) return "duplicate";

    const finalize = (status: "sent" | "failed" | "skipped", detail: string) =>
      db()
        .update(notifications)
        .set({ status, detail })
        .where(eq(notifications.id, claimed[0]!.id));

    if (!emailProvider.configured) {
      await finalize("skipped", "email provider not configured");
      return "skipped";
    }
    const to = await resolveRecipient(args.workspaceId, settings?.email);
    if (!to) {
      await finalize("skipped", "no recipient email");
      return "skipped";
    }

    const email = renderDraftApprovalEmail({
      customerMessage: args.customerMessage,
      suggestedReply: args.suggestedReply,
      reviewUrl: `${appUrl()}/conversations/${args.conversationId}`,
    });
    const sent = await emailProvider.send({ to, ...email });
    if (!sent.ok) {
      await finalize("failed", sent.error ?? "send failed");
      return "failed";
    }
    await finalize("sent", to);
    return "sent";
  } catch {
    return "failed";
  }
}

async function record(
  workspaceId: string,
  dedupeKey: string,
  status: "sent" | "failed" | "skipped",
  detail: string,
): Promise<void> {
  await db()
    .insert(notifications)
    .values({ workspaceId, type: "draft_approval", dedupeKey, channel: "email", status, detail })
    .onConflictDoNothing();
}
