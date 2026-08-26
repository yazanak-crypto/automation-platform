import { callAi } from "@platform/ai";
import type { CatalogQuestion, CatalogRow } from "../verticals/types";
import {
  CATALOG_EXTRACT_PROMPT_REF,
  CATALOG_EXTRACT_PROMPT_VERSION,
  CATALOG_MAP_PROMPT_REF,
  CATALOG_MAP_PROMPT_VERSION,
  columnMapPrompt,
  EXTRACT_FILE_INSTRUCTION,
  extractSystemPrompt,
  extractTextPrompt,
  parseJsonReply,
} from "./prompt";
import { capRows, normalizeRow } from "./rows";
import {
  applyColumnMap,
  guessColumnMap,
  mappingSample,
  parseCsv,
  parseSpreadsheet,
  type ColumnMap,
  type Grid,
} from "./tabular";

// Server-side extraction. Uploaded bytes are read in memory and never stored:
// the import produces rows, and the rows are what the owner reviews.

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Image types Anthropic accepts directly. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SPREADSHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export interface ExtractInput {
  workspaceId: string;
  catalog: CatalogQuestion;
  verticalLabel: string;
  /** Exactly one of these. */
  file?: { bytes: Uint8Array; mediaType: string; name: string };
  text?: string;
}

export interface ExtractResult {
  rows: CatalogRow[];
  /** Rows past CATALOG_MAX_ITEMS. Surfaced, never silently discarded. */
  dropped: number;
  /** How the rows were produced — drives the receipt and the UI wording. */
  source: "file" | "paste";
  sourceName?: string;
}

export class CatalogExtractError extends Error {}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Shape of one item as the model returns it, before normalization. */
interface RawItem {
  name?: string;
  price?: string | number;
  description?: string;
  attributes?: Record<string, unknown>;
  issue?: string;
  raw?: string;
}

function toRows(items: RawItem[] | undefined): CatalogRow[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) =>
    normalizeRow({
      name: item.name,
      // A model occasionally returns a bare number despite the instruction;
      // stringify rather than reject, the value is still correct.
      price: item.price === undefined || item.price === null ? undefined : String(item.price),
      description: item.description,
      attributes: Object.fromEntries(
        Object.entries(item.attributes ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
      ),
      issue: item.issue,
      raw: item.raw,
    }),
  );
}

/** Ask the model for a column mapping when the headers are not recognisable. */
async function mapColumnsWithAi(workspaceId: string, grid: Grid): Promise<ColumnMap> {
  const res = await callAi({
    workspaceId,
    promptRef: CATALOG_MAP_PROMPT_REF,
    promptVersion: CATALOG_MAP_PROMPT_VERSION,
    // Header mapping is a small, well-specified classification — the cheap tier
    // is enough, and it runs once per import regardless of row count.
    tier: "fast",
    prompt: columnMapPrompt(mappingSample(grid)),
    maxTokens: 200,
  });
  const parsed = parseJsonReply<Record<string, number>>(res.text);
  const idx = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v < grid.headers.length ? v : undefined;
  return {
    name: idx(parsed?.name),
    price: idx(parsed?.price),
    description: idx(parsed?.description),
  };
}

/**
 * Spreadsheets and CSVs: parse locally, map columns, apply the map to every
 * row here rather than sending the rows anywhere.
 */
async function extractTabular(
  input: ExtractInput,
  grid: Grid,
): Promise<CatalogRow[]> {
  if (!grid.headers.length) return [];
  let map = guessColumnMap(grid.headers);
  if (!map) map = await mapColumnsWithAi(input.workspaceId, grid);
  if (map.name === undefined) {
    // Still no name column: rather than guess, treat the first column as the
    // name and flag every row. The owner fixes a mapping, not 200 rows.
    map = { ...map, name: 0 };
    return applyColumnMap(grid, map).map((r) => ({
      ...r,
      issue: r.issue ?? "Check this is the right column for the name",
    }));
  }
  return applyColumnMap(grid, map);
}

/** Images and PDFs go to the vision tier through the shared AI gateway. */
async function extractFromDocument(input: ExtractInput): Promise<CatalogRow[]> {
  const file = input.file!;
  const block =
    file.mediaType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: toBase64(file.bytes),
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: file.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: toBase64(file.bytes),
          },
        };

  const res = await callAi({
    workspaceId: input.workspaceId,
    promptRef: CATALOG_EXTRACT_PROMPT_REF,
    promptVersion: CATALOG_EXTRACT_PROMPT_VERSION,
    // Menu photos are genuinely hard — multi-column layouts, stylised type,
    // handwriting, Arabic script. The cheap tier loses rows here.
    tier: "frontier",
    system: extractSystemPrompt(input.catalog, input.verticalLabel),
    prompt: EXTRACT_FILE_INSTRUCTION,
    content: [block, { type: "text", text: EXTRACT_FILE_INSTRUCTION }],
    maxTokens: 8000,
  });
  return toRows(parseJsonReply<{ items?: RawItem[] }>(res.text)?.items);
}

/** Pasted free text: "Studio JVC 45k, 1BR Marina 85k". */
async function extractFromText(input: ExtractInput): Promise<CatalogRow[]> {
  const res = await callAi({
    workspaceId: input.workspaceId,
    promptRef: CATALOG_EXTRACT_PROMPT_REF,
    promptVersion: CATALOG_EXTRACT_PROMPT_VERSION,
    tier: "fast",
    system: extractSystemPrompt(input.catalog, input.verticalLabel),
    prompt: extractTextPrompt(input.text!),
    maxTokens: 4000,
  });
  return toRows(parseJsonReply<{ items?: RawItem[] }>(res.text)?.items);
}

/**
 * Extract catalog rows from an upload or a paste.
 *
 * Nothing here writes to the database. The caller shows the result in the
 * review table, and only an explicit confirm turns rows into knowledge.
 */
export async function extractCatalog(input: ExtractInput): Promise<ExtractResult> {
  if (input.file) {
    const { bytes, mediaType, name } = input.file;
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new CatalogExtractError("That file is larger than 12MB — try a smaller one.");
    }
    let rows: CatalogRow[];
    if (mediaType === "text/csv" || name.toLowerCase().endsWith(".csv")) {
      rows = await extractTabular(input, parseCsv(decodeUtf8(bytes)));
    } else if (SPREADSHEET_TYPES.has(mediaType) || /\.xlsx?$/i.test(name)) {
      rows = await extractTabular(input, parseSpreadsheet(bytes));
    } else if (IMAGE_TYPES.has(mediaType) || mediaType === "application/pdf") {
      rows = await extractFromDocument(input);
    } else {
      throw new CatalogExtractError(
        "Upload a photo, PDF, CSV or spreadsheet — that file type isn't supported.",
      );
    }
    const capped = capRows(rows);
    return { rows: capped.rows, dropped: capped.dropped, source: "file", sourceName: name };
  }

  if (input.text?.trim()) {
    const capped = capRows(await extractFromText(input));
    return { rows: capped.rows, dropped: capped.dropped, source: "paste" };
  }

  throw new CatalogExtractError("Nothing to import — upload a file or paste your items.");
}
