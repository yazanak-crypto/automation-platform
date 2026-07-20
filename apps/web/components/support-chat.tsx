"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";

// AI support assistant panel. Opens on the `otto:help-open` window event
// (dispatched by the Help nav item). Talks to /api/support — no keys client
// side; the server falls back to canned answers if AI is unavailable.

interface Msg { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "How do I activate an automation?",
  "How does billing work?",
  "How do I connect a channel?",
];

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("otto:help-open", onOpen);
    return () => window.removeEventListener("otto:help-open", onOpen);
  }, []);

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10) }),
      });
      const data = res.ok ? await res.json() : null;
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data?.reply ?? "I couldn't reach support just now — try again, or email support@example.com." },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "I couldn't reach support just now — try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} aria-hidden />
      <div
        role="dialog"
        aria-label={`${BRAND} help`}
        className="rise fixed bottom-0 right-0 z-[81] flex h-[min(560px,88vh)] w-full flex-col border border-line bg-bg shadow-2xl sm:bottom-5 sm:right-5 sm:w-[380px] sm:rounded-[16px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--brass-dim)" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--brass)" }} />
            </span>
            <div>
              <p className="text-[13px] font-medium leading-tight">{BRAND} Assistant</p>
              <p className="text-[11px] text-ink-3">Here to help you get set up</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="press-glow rounded-md p-1 text-ink-3 hover:text-ink" aria-label="Close">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div>
              <p className="text-[13px] leading-relaxed text-ink-2">
                Hi — I&apos;m the {BRAND} assistant. Ask me how to set things up, activate automations,
                connect channels, or anything about billing and your account.
              </p>
              <div className="mt-3 flex flex-col items-start gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="press-glow rounded-full border border-line px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  m.role === "user" ? "bg-white text-black" : "border border-line bg-raised text-ink"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-line bg-raised px-3.5 py-2.5">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
          className="flex items-center gap-2 border-t border-line px-3 py-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            className="flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-[13px] focus:border-line-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="press-glow rounded-lg bg-white px-3.5 py-2 text-[13px] font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
