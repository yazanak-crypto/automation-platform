"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Page, PageHeader, RelativeTime, SkeletonRows } from "@/components/ui";

interface Row {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  channels: string[];
  firstContactAt: string;
  lastContactAt: string | null;
  conversationCount: number;
  messageCount: number;
}

const SORTS = [
  { id: "last_contact", label: "Last contact" },
  { id: "first_contact", label: "First contact" },
  { id: "name", label: "Name" },
  { id: "conversations", label: "Conversations" },
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  web_chat: "Website",
  gmail: "Email",
  email: "Email",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export default function ContactsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("last_contact");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ sort });
    if (query) params.set("q", query);
    const res = await fetch(`/api/contacts?${params}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setRows(data.contacts);
      setTotal(data.total);
    } else {
      setRows([]);
    }
  }, [sort, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportHref = useMemo(
    () => `/api/contacts/export${query ? `?q=${encodeURIComponent(query)}` : ""}`,
    [query],
  );

  return (
    <Page wide>
      <PageHeader
        title="Contacts"
        subtitle={
          rows === null
            ? "Everyone who has contacted your business."
            : `${total} ${total === 1 ? "person has" : "people have"} contacted your business.`
        }
        action={
          rows && rows.length > 0 ? (
            <a
              href={exportHref}
              className="press-glow rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-hover"
            >
              Export CSV
            </a>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, or phone…"
          className="w-full max-w-xs rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none"
        />
        <div className="flex items-center gap-1 text-[12px] text-ink-3">
          <span className="mr-1">Sort</span>
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`rounded-md px-2 py-1 transition-colors ${
                sort === s.id ? "bg-hover text-ink" : "hover:text-ink-2"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <SkeletonRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState title={query ? "No contacts match that search" : "No contacts yet"}>
          {query
            ? "Try a different name, email, or phone number."
            : "Everyone who messages you on any channel appears here — with what they asked, kept for as long as you want it. Website visitors stay anonymous unless they share a name or email in the chat."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase tracking-wide text-ink-3">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Contact</th>
                <th className="py-2 pr-3 font-medium">Channel</th>
                <th className="py-2 pr-3 font-medium">First</th>
                <th className="py-2 pr-3 font-medium">Last</th>
                <th className="py-2 pr-3 text-right font-medium">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const anonymous = !r.displayName && !r.email && !r.phone;
                return (
                  <tr key={r.id} className="border-b border-line transition-colors hover:bg-hover">
                    <td className="py-3 pr-3">
                      <Link href={`/contacts/${r.id}`} className="font-medium hover:underline">
                        {r.displayName ?? (
                          <span className="text-ink-2">Anonymous visitor</span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-ink-2">
                      {r.email ?? r.phone ?? <span className="text-ink-3">—</span>}
                    </td>
                    <td className="py-3 pr-3 text-ink-2">
                      {r.channels.length
                        ? r.channels.map((c) => CHANNEL_LABELS[c] ?? c).join(", ")
                        : "—"}
                    </td>
                    <td className="py-3 pr-3">
                      <RelativeTime value={r.firstContactAt} />
                    </td>
                    <td className="py-3 pr-3">
                      {r.lastContactAt ? (
                        <RelativeTime value={r.lastContactAt} />
                      ) : (
                        <span className="text-[12px] text-ink-3">—</span>
                      )}
                    </td>
                    <td className="tnum py-3 pr-3 text-right text-ink-2">
                      {r.conversationCount}
                    </td>
                    {anonymous && <td className="hidden" aria-hidden />}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > rows.length && (
            <p className="mt-4 text-[12px] text-ink-3">
              Showing {rows.length} of {total}. Export the CSV for the full list.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
