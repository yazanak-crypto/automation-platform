import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { CatalogRow } from "../verticals/types";
import { normalizeRow } from "./rows";

// CSV / XLSX parsing. The ROWS never reach a model: only the header line and a
// few sample rows are sent for column mapping, then the mapping is applied
// locally. That keeps cost O(1) in catalog size and means a customer's full
// price list is not shipped to a provider to be read back.

export interface Grid {
  headers: string[];
  rows: string[][];
}

/**
 * CSV bytes → grid.
 *
 * `Papa` is told nothing about the delimiter: Arabic-locale exports from Excel
 * frequently use ';' rather than ',', and its sniffing handles both. A BOM is
 * stripped because Excel writes one and it otherwise becomes part of the first
 * header name.
 */
export function parseCsv(text: string): Grid {
  const clean = text.replace(/^﻿/, "");
  const out = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const rows = (out.data ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c).trim()));
  const headers = (rows.shift() ?? []).map((h) => String(h ?? "").trim());
  return { headers, rows: rows.map((r) => r.map((c) => String(c ?? "").trim())) };
}

/** XLSX/XLS bytes → grid, reading the first sheet only. */
export function parseSpreadsheet(bytes: Uint8Array): Grid {
  const wb = XLSX.read(bytes, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return { headers: [], rows: [] };
  const sheet = wb.Sheets[first]!;
  // `raw: false` so dates and currency-formatted cells arrive as the strings
  // the owner sees in Excel, not as serial numbers.
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  const rows = matrix.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim()));
  const headers = (rows.shift() ?? []).map((h) => String(h ?? "").trim());
  return { headers, rows: rows.map((r) => r.map((c) => String(c ?? "").trim())) };
}

/** Which column feeds which field. Anything unmapped becomes an attribute. */
export interface ColumnMap {
  name?: number;
  price?: number;
  description?: number;
}

const NAME_HINTS = ["name", "item", "dish", "product", "title", "listing", "service", "اسم", "الصنف", "المنتج", "الخدمة"];
const PRICE_HINTS = ["price", "rate", "cost", "amount", "سعر", "السعر", "التكلفة"];
const DESC_HINTS = ["description", "details", "notes", "about", "وصف", "التفاصيل", "ملاحظات"];

function matchHeader(header: string, hints: string[]): boolean {
  const h = header.toLowerCase().trim();
  return hints.some((hint) => h === hint || h.includes(hint));
}

/**
 * Guess the column mapping from header names alone.
 *
 * Deliberately tried BEFORE any model call: the overwhelming majority of real
 * sheets say "Name"/"Price" or the Arabic equivalent, and spending a request
 * plus a round-trip on those is waste. Returns null when it cannot find a name
 * column, which is the signal to fall back to the model.
 */
export function guessColumnMap(headers: readonly string[]): ColumnMap | null {
  const map: ColumnMap = {};
  headers.forEach((h, i) => {
    if (map.name === undefined && matchHeader(h, NAME_HINTS)) map.name = i;
    else if (map.price === undefined && matchHeader(h, PRICE_HINTS)) map.price = i;
    else if (map.description === undefined && matchHeader(h, DESC_HINTS)) map.description = i;
  });
  return map.name === undefined ? null : map;
}

/**
 * Apply a mapping to every row locally.
 *
 * A row whose name cell is empty still comes back — with the whole line joined
 * into `raw` and an issue set — so it lands in the review table for repair
 * instead of vanishing between the file and the screen.
 */
export function applyColumnMap(grid: Grid, map: ColumnMap): CatalogRow[] {
  return grid.rows.map((cells) => {
    const attributes: Record<string, string> = {};
    grid.headers.forEach((header, i) => {
      if (i === map.name || i === map.price || i === map.description) return;
      const value = cells[i];
      if (header && value) attributes[header] = value;
    });

    const name = map.name !== undefined ? (cells[map.name] ?? "") : "";
    return normalizeRow({
      name,
      price: map.price !== undefined ? cells[map.price] : undefined,
      description: map.description !== undefined ? cells[map.description] : undefined,
      attributes,
      ...(name.trim() ? {} : { raw: cells.filter(Boolean).join(" | ") }),
    });
  });
}

/** Header row plus a few samples — the only part of a sheet a model ever sees. */
export function mappingSample(grid: Grid, sampleRows = 3): string {
  const lines = [grid.headers.join(" | ")];
  for (const row of grid.rows.slice(0, sampleRows)) lines.push(row.join(" | "));
  return lines.join("\n");
}
