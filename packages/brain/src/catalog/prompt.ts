import type { CatalogQuestion } from "../verticals/types";

// Extraction prompts. Versioned like every other prompt on the platform so a
// change is visible in `ai_calls.prompt_version`.

export const CATALOG_EXTRACT_PROMPT_REF = "brain/catalog-extract";
export const CATALOG_EXTRACT_PROMPT_VERSION = "v1";
export const CATALOG_MAP_PROMPT_REF = "brain/catalog-column-map";
export const CATALOG_MAP_PROMPT_VERSION = "v1";

/**
 * Shared system prompt for reading a catalog out of an image, PDF or free text.
 *
 * Two things it must never do, both learned from how this fails in practice:
 * silently skip a row it cannot read (the owner then trusts an incomplete
 * import), and translate. A Lebanese menu lists "فتوش" — storing "Fattoush"
 * means a customer asking in Arabic no longer matches their own menu.
 */
export function extractSystemPrompt(catalog: CatalogQuestion, verticalLabel: string): string {
  return [
    `You are reading a business's ${catalog.noun} so it can be stored as structured data.`,
    `The business is: ${verticalLabel}. Each row is one ${catalog.itemNoun}.`,
    "",
    "Return ONLY a JSON object of the form:",
    '{"items":[{"name":"","price":"","description":"","attributes":{},"issue":"","raw":""}]}',
    "",
    "Rules:",
    `- "name" is required and must be the ${catalog.itemNoun} exactly as written in the source.`,
    '- "price" is a STRING copied as written — "45k", "AED 85,000/yr", "from 12", "12–18".',
    "  Never convert currency, never round, never invent a number that is not there.",
    "- Omit any field that is not present. Do not write null or an empty string.",
    `- "attributes" holds anything else this row carried. Common ones here: ${catalog.attributeHints.join(", ")}.`,
    "  These are only examples — use whatever the source actually contains, and use the",
    "  source's own wording for the keys. Different rows may carry different keys.",
    "",
    "LANGUAGE:",
    "- Never translate. Keep every value in the language it was written in.",
    "- Arabic, mixed Arabic/English, and Arabic numerals (٠١٢٣٤٥٦٧٨٩) all appear. Copy",
    "  numerals in the form they were written; do not convert between numeral systems.",
    "- A row may be Arabic while its neighbour is English. That is normal, not an error.",
    "",
    "UNREADABLE ROWS — this matters more than completeness:",
    "- If you can see there is a row but cannot read it (blur, glare, a cut-off column),",
    '  still emit it: put whatever text you can see in "raw" and describe the problem in',
    '  "issue". Leave "name" empty if you truly cannot read it.',
    "- Never drop a row you can see. An item the owner has to fix is far better than an",
    "  item that disappears without either of us noticing.",
    "- Do not invent rows to fill a gap.",
  ].join("\n");
}

/** User turn for the pasted-text path. */
export function extractTextPrompt(text: string): string {
  return `Extract every item from this text:\n\n${text}`;
}

/** User turn accompanying an image or PDF. */
export const EXTRACT_FILE_INSTRUCTION =
  "Extract every item from this document. Work through it in reading order and do not skip sections.";

/**
 * Column-mapping prompt. Sees only the header row and a few sample rows —
 * never the full sheet.
 */
export function columnMapPrompt(sample: string): string {
  return [
    "These are the first lines of a spreadsheet, pipe-separated.",
    "Identify which COLUMN INDEX (0-based) holds the item name, the price, and the",
    "description. Headers may be in any language, including Arabic.",
    "",
    'Return ONLY: {"name":0,"price":1,"description":2}',
    "Omit any key you cannot identify. Do not guess a price column that is really a",
    "quantity, a stock count or a reference number.",
    "",
    sample,
  ].join("\n");
}

/**
 * Pull the first JSON object out of a model reply.
 *
 * Models wrap JSON in prose or fences often enough that failing the whole
 * import over it would be the single most annoying possible bug here.
 */
export function parseJsonReply<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const opener = candidate[start];
  const closer = opener === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(closer);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
