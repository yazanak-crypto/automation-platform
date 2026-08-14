"use client";

import { use, useEffect, useState } from "react";
import { EmptyState, Page, PageHeader, RelativeTime, SkeletonRows } from "@/components/ui";

interface Detail {
  contact: {
    id: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    instagram: string | null;
    isAnonymousVisitor: boolean;
    createdAt: string;
  };
  conversations: Array<{
    id: string;
    channelType: string;
    status: string;
    startedAt: string;
    lastMessageAt: string;
    messages: Array<{
      id: string;
      direction: string;
      body: string;
      aiGenerated: boolean;
      draftStatus: string;
      createdAt: string;
    }>;
  }>;
}

const CHANNEL_LABELS: Record<string, string> = {
  web_chat: "Website chat",
  gmail: "Email",
  email: "Email",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null | "notfound">(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/contacts/${id}`).catch(() => null);
      if (res?.status === 404) setData("notfound");
      else if (res?.ok) setData(await res.json());
    };
    void load();
  }, [id]);

  if (data === null) {
    return (
      <Page>
        <PageHeader title="Contact" back={{ href: "/contacts", label: "Contacts" }} />
        <SkeletonRows rows={4} />
      </Page>
    );
  }
  if (data === "notfound") {
    return (
      <Page>
        <PageHeader title="Contact" back={{ href: "/contacts", label: "Contacts" }} />
        <EmptyState title="Contact not found">
          It may have been removed, or the link points somewhere else.
        </EmptyState>
      </Page>
    );
  }

  const { contact, conversations } = data;
  const totalMessages = conversations.reduce((n, c) => n + c.messages.length, 0);

  return (
    <Page>
      <PageHeader
        title={contact.displayName ?? "Anonymous visitor"}
        subtitle={
          <>
            {[contact.email, contact.phone].filter(Boolean).join(" · ") || "No contact details shared"}
            {" — "}
            {conversations.length} {conversations.length === 1 ? "conversation" : "conversations"},{" "}
            {totalMessages} {totalMessages === 1 ? "message" : "messages"}
          </>
        }
        back={{ href: "/contacts", label: "Contacts" }}
      />

      {contact.isAnonymousVisitor && (
        <p className="mb-6 rounded-lg border border-line bg-raised p-3 text-sm text-ink-2">
          This visitor used your website chat without sharing a name or email. Their history is
          still kept together, and they&apos;ll be recognised if they come back on the same device.
        </p>
      )}

      {conversations.length === 0 ? (
        <EmptyState title="No messages yet">
          This contact exists but hasn&apos;t exchanged any messages.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {conversations.map((c) => (
            <section key={c.id}>
              <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
                <span className="text-[13px] font-medium">
                  {CHANNEL_LABELS[c.channelType] ?? c.channelType}
                </span>
                <span className="text-[12px] text-ink-3">·</span>
                <RelativeTime value={c.startedAt} />
                <span className="ml-auto text-[12px] text-ink-3">{c.status}</span>
              </div>
              <div className="space-y-3">
                {c.messages.map((m) => {
                  const inbound = m.direction === "inbound";
                  // A draft that was never approved was never seen by the
                  // customer — label it rather than implying we replied.
                  const unsent =
                    !inbound && (m.draftStatus === "pending_approval" || m.draftStatus === "dismissed");
                  return (
                    <div
                      key={m.id}
                      className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-[12px] border px-3.5 py-2.5 ${
                          inbound ? "border-line bg-raised" : "border-line-strong bg-hover"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-3">
                          <span>{inbound ? "Customer" : m.aiGenerated ? "AI reply" : "You"}</span>
                          {unsent && (
                            <span className="text-brass">
                              {m.draftStatus === "dismissed" ? "not sent" : "awaiting approval"}
                            </span>
                          )}
                          <RelativeTime value={m.createdAt} />
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {m.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
