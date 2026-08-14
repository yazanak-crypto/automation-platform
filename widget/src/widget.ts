// Platform web-chat widget. Framework-free, text-only rendering (XSS-safe),
// visitor id in localStorage (anonymous continuity — plan §1b).

(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  const widgetKey = script?.getAttribute("data-key");
  if (!widgetKey) return;
  const base = script ? new URL(script.src).origin : "";
  const accent = script?.getAttribute("data-accent") ?? "#111111";

  const LS_KEY = `platform_visitor_${widgetKey}`;
  let visitorId = localStorage.getItem(LS_KEY);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(LS_KEY, visitorId);
  }

  // Optional identity. Sent once with the visitor's first message, then
  // remembered so we never ask twice. "Skipped" is remembered too — a visitor
  // who declined must not be re-prompted on every visit.
  const ID_KEY = `platform_identity_${widgetKey}`;
  let identity: { name?: string; email?: string; asked?: boolean } = {};
  try {
    identity = JSON.parse(localStorage.getItem(ID_KEY) ?? "{}");
  } catch {
    /* corrupt entry — treat as never asked */
  }
  const saveIdentity = () => {
    try {
      localStorage.setItem(ID_KEY, JSON.stringify(identity));
    } catch {
      /* private mode — identity just won't persist */
    }
  };

  interface Msg { id: string; direction: string; body: string }
  let msgs: Msg[] = [];
  let open = false;
  let pollTimer: number | undefined;
  let sending = false;

  // ── DOM ───────────────────────────────────────────────────────────────────
  const el = (tag: string, css: Partial<CSSStyleDeclaration>, parent?: HTMLElement) => {
    const node = document.createElement(tag);
    Object.assign(node.style, css);
    parent?.appendChild(node);
    return node;
  };

  const root = el("div", { position: "fixed", bottom: "20px", right: "20px", zIndex: "999999", fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }, document.body);

  const button = el("button", {
    width: "56px", height: "56px", borderRadius: "50%", border: "none", cursor: "pointer",
    background: accent, color: "#fff", fontSize: "24px", boxShadow: "0 4px 14px rgba(0,0,0,.25)",
  }, root) as HTMLButtonElement;
  button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5z"/></svg>';
  button.setAttribute("aria-label", "Open chat");

  const panel = el("div", {
    display: "none", position: "fixed", bottom: "88px", right: "20px",
    width: "min(360px, calc(100vw - 32px))", height: "min(520px, calc(100vh - 120px))",
    background: "#fff", borderRadius: "16px", boxShadow: "0 12px 40px rgba(0,0,0,.3)",
    flexDirection: "column", overflow: "hidden",
  }, root);

  const header = el("div", { background: accent, color: "#fff", padding: "14px 16px", fontSize: "14px", fontWeight: "600" }, panel);
  header.textContent = "Chat with us";
  const sub = el("div", { fontWeight: "400", fontSize: "12px", opacity: "0.8", marginTop: "2px" }, header);
  sub.textContent = "Typically replies within minutes";

  const list = el("div", { flex: "1", overflowY: "auto", padding: "12px", background: "#f7f7f8" }, panel);

  const form = el("form", { display: "flex", gap: "8px", padding: "10px", background: "#fff", borderTop: "1px solid #eee" }, panel) as HTMLFormElement;
  const input = el("input", { flex: "1", border: "1px solid #ddd", borderRadius: "10px", padding: "10px 12px", fontSize: "14px", outline: "none" }, form) as HTMLInputElement;
  input.placeholder = "Write a message…";
  input.maxLength = 4000;
  const send = el("button", { background: accent, color: "#fff", border: "none", borderRadius: "10px", padding: "0 16px", cursor: "pointer", fontSize: "14px" }, form) as HTMLButtonElement;
  send.type = "submit";
  send.textContent = "Send";

  // ── Optional identity strip ───────────────────────────────────────────────
  // Sits above the composer rather than in front of it: the message box stays
  // usable the whole time, so this can never become a gate on asking a
  // question. Shown only until answered or skipped once.
  const idBar = el("div", {
    display: "none", flexDirection: "column", gap: "6px",
    padding: "10px", background: "#fff", borderTop: "1px solid #eee",
  }, panel);
  const idLabel = el("div", { fontSize: "12px", color: "#666" }, idBar);
  idLabel.textContent = "Who are we speaking with? (optional)";
  const idRow = el("div", { display: "flex", gap: "6px" }, idBar);
  const nameInput = el("input", { flex: "1", minWidth: "0", border: "1px solid #ddd", borderRadius: "8px", padding: "7px 9px", fontSize: "13px", outline: "none" }, idRow) as HTMLInputElement;
  nameInput.placeholder = "Name";
  nameInput.maxLength = 120;
  const emailInput = el("input", { flex: "1", minWidth: "0", border: "1px solid #ddd", borderRadius: "8px", padding: "7px 9px", fontSize: "13px", outline: "none" }, idRow) as HTMLInputElement;
  emailInput.placeholder = "Email";
  emailInput.type = "email";
  emailInput.maxLength = 300;
  const idActions = el("div", { display: "flex", gap: "8px", alignItems: "center" }, idBar);
  const idSave = el("button", { background: accent, color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "12px" }, idActions) as HTMLButtonElement;
  idSave.type = "button";
  idSave.textContent = "Save";
  const idSkip = el("button", { background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: "12px", textDecoration: "underline" }, idActions) as HTMLButtonElement;
  idSkip.type = "button";
  idSkip.textContent = "Skip";

  function showIdBar() {
    idBar.style.display = identity.asked ? "none" : "flex";
  }
  idSave.addEventListener("click", () => {
    const n = nameInput.value.trim();
    const e = emailInput.value.trim();
    // An invalid address is dropped rather than rejected — nagging a customer
    // about a typo in an optional field is worse than not having the field.
    identity = { name: n || undefined, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : undefined, asked: true };
    saveIdentity();
    showIdBar();
    input.focus();
  });
  idSkip.addEventListener("click", () => {
    identity.asked = true;
    saveIdentity();
    showIdBar();
    input.focus();
  });

  const powered = el("div", { textAlign: "center", fontSize: "11px", color: "#999", padding: "4px 0 8px", background: "#fff" }, panel);
  powered.textContent = "Powered by Ovanth";

  function render() {
    list.textContent = "";
    if (msgs.length === 0) {
      const empty = el("div", { color: "#888", fontSize: "13px", textAlign: "center", marginTop: "24px" }, list);
      empty.textContent = "Ask us anything — we're happy to help.";
    }
    for (const m of msgs) {
      const mine = m.direction === "inbound";
      const row = el("div", { display: "flex", justifyContent: mine ? "flex-end" : "flex-start", margin: "6px 0" }, list);
      const bubble = el("div", {
        maxWidth: "80%", padding: "8px 12px", borderRadius: "14px", fontSize: "14px",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        background: mine ? accent : "#fff", color: mine ? "#fff" : "#111",
        border: mine ? "none" : "1px solid #e5e5e5",
      }, row);
      bubble.textContent = m.body; // text node only — never HTML
    }
    list.scrollTop = list.scrollHeight;
  }

  // ── API ───────────────────────────────────────────────────────────────────
  let warnedBlocked = false;
  function warnIfBlocked(status: number) {
    if (status === 403 && !warnedBlocked) {
      warnedBlocked = true;
      console.warn(
        `Ovanth chat: this site (${location.origin}) isn't on the allowed list for this widget key. ` +
          "Add it under Channels → Website chat → Allowed sites in your Ovanth dashboard.",
      );
    }
  }

  async function poll() {
    try {
      const res = await fetch(`${base}/api/webchat/${widgetKey}/conversations/${visitorId}`);
      warnIfBlocked(res.status);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Msg[] };
      if (JSON.stringify(data.messages) !== JSON.stringify(msgs)) {
        msgs = data.messages;
        render();
      }
    } catch {
      /* transient network errors are fine — next poll retries */
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body || sending) return;
    sending = true;
    send.disabled = true;
    const clientMessageId = crypto.randomUUID();
    msgs = [...msgs, { id: clientMessageId, direction: "inbound", body }];
    input.value = "";
    render();
    try {
      const res = await fetch(`${base}/api/webchat/${widgetKey}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          body,
          clientMessageId,
          ...(identity.name ? { name: identity.name } : {}),
          ...(identity.email ? { email: identity.email } : {}),
        }),
      });
      warnIfBlocked(res.status);
      void poll();
    } catch {
      /* message will re-sync on next poll */
    } finally {
      sending = false;
      send.disabled = false;
    }
  });

  function setOpen(next: boolean) {
    open = next;
    panel.style.display = open ? "flex" : "none";
    button.innerHTML = open
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
      : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5z"/></svg>';
    if (pollTimer) window.clearInterval(pollTimer);
    if (open) {
      void poll();
      pollTimer = window.setInterval(poll, 3000);
      showIdBar();
      input.focus();
    }
  }
  button.addEventListener("click", () => setOpen(!open));

  // One quiet poll on load: returning visitors see continuity hint via history.
  void poll();
})();
