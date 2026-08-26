"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  emptyRow,
  fieldDirection,
  needsReview,
  newRowId,
  rowIsRtl,
} from "@platform/brain/catalog/rows";
import {
  CATALOG_MAX_ITEMS,
  type CatalogAnswer,
  type CatalogQuestion,
  type CatalogRow,
} from "@platform/brain/verticals";

// The catalog import step. Three ways in — upload, paste, type by hand — all
// converging on the same review table. Nothing leaves this component for the
// Brain until "Save" is pressed.

type Phase = "choose" | "working" | "review" | "saved";

/** Fields every row shows. Anything else is an attribute column. */
const BASE_COLUMNS = ["name", "price", "description"] as const;

export function CatalogImport({
  question,
  vertical,
  questionId,
  value,
  onChange,
}: {
  question: CatalogQuestion;
  vertical: string;
  questionId: string;
  value?: CatalogAnswer;
  onChange: (v: CatalogAnswer) => void;
}) {
  const [phase, setPhase] = useState<Phase>(value?.count ? "saved" : "choose");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [source, setSource] = useState<CatalogAnswer["source"]>("file");
  const [sourceName, setSourceName] = useState<string | undefined>();
  const [dropped, setDropped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Attribute columns, unioned across rows and kept in first-seen order.
   *
   * Rows legitimately disagree about which attributes they carry — one listing
   * has a "floor", the next does not — so the table is the union and a row
   * simply leaves a cell empty rather than the column disappearing.
   */
  const attributeColumns = useMemo(() => {
    const seen: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row.attributes ?? {})) {
        if (!seen.includes(key)) seen.push(key);
      }
    }
    return seen;
  }, [rows]);

  const review = useMemo(() => needsReview(rows), [rows]);
  const usable = useMemo(() => rows.filter((r) => r.name.trim()).length, [rows]);

  const send = useCallback(
    async (body: FormData, label: string, src: CatalogAnswer["source"], name?: string) => {
      setError(null);
      setBusyLabel(label);
      setPhase("working");
      body.set("vertical", vertical);
      body.set("questionId", questionId);
      const res = await fetch("/api/brain/catalog/extract", { method: "POST", body }).catch(
        () => null,
      );
      if (!res?.ok) {
        const msg = await res?.json().catch(() => null);
        setError(
          typeof msg?.error === "string"
            ? msg.error
            : "That didn't work. Try a clearer photo, or paste the items as text.",
        );
        setPhase("choose");
        return;
      }
      const data = (await res.json()) as { rows: CatalogRow[]; dropped: number };
      setRows(data.rows);
      setDropped(data.dropped ?? 0);
      setSource(src);
      setSourceName(name);
      // An extraction that found nothing is not an error — it lands in the
      // table with one blank row so the owner can type instead of starting over.
      setPhase("review");
      if (!data.rows.length) setRows([emptyRow()]);
    },
    [questionId, vertical],
  );

  function onFile(file: File) {
    const body = new FormData();
    body.set("file", file);
    void send(body, `Reading ${file.name}…`, "file", file.name);
  }

  function onPaste() {
    if (!paste.trim()) return;
    const body = new FormData();
    body.set("text", paste);
    void send(body, "Reading your list…", "paste");
  }

  function startManual() {
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    setSource("manual");
    setSourceName(undefined);
    setDropped(0);
    setPhase("review");
  }

  function patchRow(id: string, patch: Partial<CatalogRow>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Editing a flagged row is the owner resolving it — the flag goes as
        // soon as the row has a name, rather than lingering until save.
        if (next.issue && next.name.trim()) delete next.issue;
        return next;
      }),
    );
  }

  function patchAttribute(id: string, key: string, val: string) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, attributes: { ...(r.attributes ?? {}), [key]: val } } : r)),
    );
  }

  async function save() {
    setBusyLabel("Saving…");
    setError(null);
    const payload = rows.filter((r) => r.name.trim());
    const res = await fetch("/api/brain/catalog/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload, source, sourceName }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Saving didn't go through — please try again.");
      setBusyLabel("");
      return;
    }
    const data = (await res.json()) as { answer: CatalogAnswer };
    onChange(data.answer);
    setBusyLabel("");
    setPhase("saved");
  }

  // ── Already imported ──────────────────────────────────────────────────────
  if (phase === "saved" && value?.count) {
    return (
      <div className="rounded-[10px] border border-line bg-raised p-4">
        <p className="text-sm">
          <span className="text-ok">✓</span> {value.count}{" "}
          {value.count === 1 ? question.itemNoun : `${question.itemNoun}s`} saved to your Business
          Brain
          {value.sourceName ? ` from ${value.sourceName}` : ""}.
        </p>
        <p className="mt-1 text-[12px] text-ink-3">
          Edit them any time in Knowledge. Importing again adds to what's there.
        </p>
        <button
          onClick={() => {
            setRows([]);
            setPhase("choose");
          }}
          className="mt-3 text-[12.5px] text-ink-3 underline underline-offset-4 hover:text-ink-2"
        >
          Import more
        </button>
      </div>
    );
  }

  // ── Working ───────────────────────────────────────────────────────────────
  if (phase === "working") {
    return (
      <div className="rounded-[10px] border border-line bg-raised p-6 text-center">
        <p className="text-sm text-ink-2">{busyLabel}</p>
        <p className="mt-1 text-[12px] text-ink-3">
          Photos and PDFs take a few seconds — we read every line.
        </p>
      </div>
    );
  }

  // ── Review table ──────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm">
            {usable} {usable === 1 ? question.itemNoun : `${question.itemNoun}s`} found
          </p>
          {review.length > 0 && (
            <p className="text-[12.5px] text-wait">
              {review.length} need{review.length === 1 ? "s" : ""} a look — highlighted below
            </p>
          )}
          {dropped > 0 && (
            <p className="text-[12.5px] text-wait">
              Only the first {CATALOG_MAX_ITEMS} were imported ({dropped} more in the file).
            </p>
          )}
        </div>

        {/* Wide catalogs scroll inside the table, never the page. */}
        <div className="overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <th className="px-3 py-2 font-medium">{question.itemNoun}</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Description</th>
                {attributeColumns.map((col) => (
                  // Header text may itself be Arabic ("المساحة") — let the
                  // browser orient each one from its own first strong character.
                  <th key={col} className="px-3 py-2 font-medium" dir="auto">
                    {col}
                  </th>
                ))}
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-line last:border-0 ${
                    row.issue ? "bg-wait-dim" : ""
                  }`}
                >
                  {BASE_COLUMNS.map((col) => (
                    <td key={col} className="px-1 py-1">
                      <input
                        value={row[col] ?? ""}
                        onChange={(e) => patchRow(row.id, { [col]: e.target.value })}
                        placeholder={col === "name" ? "Name" : ""}
                        /**
                         * dir="auto" per CELL, not per table. A mixed catalog
                         * has Arabic and Latin rows side by side; forcing one
                         * direction on the table mangles whichever half loses.
                         * The browser picks from each value's own first strong
                         * character, and re-picks as the owner types.
                         */
                        dir="auto"
                        className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-hover"
                      />
                    </td>
                  ))}
                  {attributeColumns.map((col) => (
                    <td key={col} className="px-1 py-1">
                      <input
                        value={row.attributes?.[col] ?? ""}
                        onChange={(e) => patchAttribute(row.id, col, e.target.value)}
                        dir="auto"
                        className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-hover"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 align-middle">
                    <button
                      onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                      aria-label={`Remove ${row.name || "row"}`}
                      className="text-ink-3 transition-colors hover:text-stop"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Anything we could see but could not parse, shown verbatim so the
            owner can retype it rather than wonder what went missing. */}
        {review.some((r) => r.raw) && (
          <div className="mt-3 rounded-[10px] border border-line border-l-2 border-l-wait p-3">
            <p className="text-[12px] font-medium text-wait">Couldn&apos;t read these</p>
            {review
              .filter((r) => r.raw)
              .map((r) => (
                <p
                  key={r.id}
                  className="mt-1 text-[12px] text-ink-3"
                  dir={rowIsRtl(r) ? "rtl" : "ltr"}
                >
                  {r.raw}
                  {r.issue ? <span className="text-ink-3"> — {r.issue}</span> : null}
                </p>
              ))}
          </div>
        )}

        {error && <p className="mt-3 text-[12.5px] text-stop">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            disabled={!usable || !!busyLabel}
            className="press-glow rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40"
          >
            {busyLabel || `Save ${usable} to my Brain`}
          </button>
          <button
            onClick={() => setRows((rs) => [...rs, { ...emptyRow(), id: newRowId() }])}
            className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-hover"
          >
            Add a row
          </button>
          <button
            onClick={() => setPhase("choose")}
            className="text-sm text-ink-3 underline underline-offset-4 hover:text-ink-2"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  // ── Choose a way in ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className="rounded-[10px] border border-dashed border-line-strong p-6 text-center"
      >
        <p className="text-sm">Drop your {question.noun} here</p>
        <p className="mt-1 text-[12px] text-ink-3">
          A photo, PDF, CSV or spreadsheet. We&apos;ll read it and show you what we found.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="press-glow mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Choose a file
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-[12.5px] text-ink-2">Or paste it as text</p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          dir="auto"
          placeholder={question.pastePlaceholder}
          className="w-full rounded-lg border border-line bg-bg p-3 text-sm leading-relaxed focus:border-line-strong focus:outline-none"
        />
        <button
          onClick={onPaste}
          disabled={!paste.trim()}
          className="mt-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover disabled:opacity-40"
        >
          Read this
        </button>
      </div>

      {error && <p className="text-[12.5px] text-stop">{error}</p>}

      <p className="text-[12.5px] text-ink-3">
        <button onClick={startManual} className="underline underline-offset-4 hover:text-ink-2">
          Or type them in yourself
        </button>{" "}
        — and if you don&apos;t have a {question.noun}, skip this step.
      </p>
    </div>
  );
}

export { fieldDirection };
