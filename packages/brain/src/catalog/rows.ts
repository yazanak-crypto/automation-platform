import { CATALOG_MAX_ITEMS, type CatalogRow } from "../verticals/types";

// Pure row helpers. No db, no network, no LLM — imported by both the server
// extractor and the client review table, so this file must stay bundleable for
// the browser (same rule as verticals/index.ts).

/**
 * Strong RTL characters (bidi classes R and AL).
 *
 * The Arabic-Indic digit ranges are deliberately EXCLUDED — U+0660–0669 and
 * U+06F0–06F9 are bidi class AN (Arabic Number), which is neutral, not strong.
 * Including them made a price of "١٢٣" flip its whole row to RTL, which is not
 * what a browser's `dir="auto"` does and not what the owner sees while typing.
 * Written as escapes rather than literal glyphs so the gaps stay reviewable.
 */
const RTL_CHARS =
  /[֐-׿؀-ٟ٪-ۯۺ-ۿ܀-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
/** Strong LTR letters (bidi class L) — Latin, Latin-1 and Latin Extended. */
const LTR_CHARS = /[A-Za-zÀ-ɏ]/;

/**
 * Direction for one field.
 *
 * Per FIELD, never per table: a mixed catalog ("فتوش 7", "Margherita 12") has
 * rows pulling opposite ways, and forcing one direction on the whole table
 * mangles whichever half loses. We mirror the HTML `dir="auto"` rule — first
 * strong character wins — but compute it explicitly so the same answer is
 * available for non-DOM uses (CSV export, prompt rendering).
 */
export function fieldDirection(text: string | undefined | null): "rtl" | "ltr" {
  if (!text) return "ltr";
  const rtl = text.search(RTL_CHARS);
  const ltr = text.search(LTR_CHARS);
  if (rtl === -1) return "ltr";
  if (ltr === -1) return "rtl";
  return rtl < ltr ? "rtl" : "ltr";
}

/** True when any field carries RTL text — used to orient the row as a whole. */
export function rowIsRtl(row: CatalogRow): boolean {
  return (
    fieldDirection(row.name) === "rtl" ||
    fieldDirection(row.description) === "rtl" ||
    Object.values(row.attributes ?? {}).some((v) => fieldDirection(v) === "rtl")
  );
}

/**
 * Pluralise a catalog noun for display.
 *
 * `${itemNoun}s` is wrong for the very first vertical that uses it — the
 * restaurant set says "dish", and the review table read "5 dishs found".
 * Sibilant endings take "es"; everything the vertical files use today
 * (listing, product, service, item) takes a plain "s".
 */
export function pluralize(noun: string, count: number): string {
  if (count === 1) return noun;
  return /(s|x|z|ch|sh)$/i.test(noun) ? `${noun}es` : `${noun}s`;
}

let seq = 0;
/** Ids are table-local and never persisted, so a counter is enough. */
export function newRowId(): string {
  seq += 1;
  return `r${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyRow(): CatalogRow {
  return { id: newRowId(), name: "" };
}

/**
 * Normalize one extracted row.
 *
 * Trims, drops empty attribute keys, and flags anything a human must look at.
 * A nameless row is NOT discarded — it keeps whatever text we saw in `raw` so
 * the owner can repair it. Silent drops are the failure mode this whole step
 * exists to avoid.
 */
export function normalizeRow(input: Partial<CatalogRow> & { id?: string }): CatalogRow {
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.attributes ?? {})) {
    const key = String(k ?? "").trim();
    const val = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    if (key && val) attributes[key] = val;
  }

  const name = (input.name ?? "").trim();
  const row: CatalogRow = {
    id: input.id ?? newRowId(),
    name,
    ...(input.price?.trim() ? { price: input.price.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(input.raw?.trim() ? { raw: input.raw.trim() } : {}),
  };

  const issue = input.issue?.trim() || (!name ? "Couldn't read a name for this row" : "");
  if (issue) row.issue = issue;
  return row;
}

/** Rows the owner still has to look at. Drives the review-table summary. */
export function needsReview(rows: readonly CatalogRow[]): CatalogRow[] {
  return rows.filter((r) => !!r.issue);
}

/**
 * Enforce the import ceiling.
 *
 * Truncating is reported, never silent — the caller surfaces `dropped` so an
 * owner with a 900-line price list learns that 400 lines did not arrive.
 */
export function capRows(rows: readonly CatalogRow[]): { rows: CatalogRow[]; dropped: number } {
  if (rows.length <= CATALOG_MAX_ITEMS) return { rows: [...rows], dropped: 0 };
  return { rows: rows.slice(0, CATALOG_MAX_ITEMS), dropped: rows.length - CATALOG_MAX_ITEMS };
}

/**
 * Render one row as the `content` of its knowledge item — this string is what
 * the drafting model actually reads, so it must be unambiguous on its own
 * without the table around it.
 */
export function renderRowContent(row: CatalogRow): string {
  const parts: string[] = [row.name];
  if (row.price) parts.push(`Price: ${row.price}`);
  if (row.description) parts.push(row.description);
  for (const [k, v] of Object.entries(row.attributes ?? {})) parts.push(`${k}: ${v}`);
  return parts.filter(Boolean).join("\n");
}
