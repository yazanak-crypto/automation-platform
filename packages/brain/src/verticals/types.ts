// Guided Brain setup: question sets as DATA, never code.
//
// Adding a vertical must mean writing one file and adding one line to the
// registry — no component changes. That holds because the renderer switches on
// `input`, never on a question id. If you ever find yourself special-casing an
// id in the UI, the schema is missing an input type; add the type instead.

export type InputType =
  /** One line. Use only where the answer is genuinely unique to the business. */
  | "short_text"
  /** A few sentences. Same rule — free text is the last resort, not the default. */
  | "long_text"
  /** Pick exactly one. Renders as tappable cards, not a <select>. */
  | "single_select"
  /** Pick any number. Renders as toggleable chips. */
  | "chips"
  /** Chips plus a free-text box for anything the presets don't cover. */
  | "chips_plus_text"
  /** Yes/no. Renders as a switch. */
  | "switch"
  /** Per-day open/close, with closed days and "same as" copying. */
  | "weekly_hours"
  /** A from–to range with a currency, or "varies". */
  | "price_range"
  /** Repeatable single lines (services, areas). */
  | "list"
  /**
   * Catalog import: upload a file / paste text / type rows by hand, review the
   * extracted items in a table, then confirm. Copy and extraction hints come
   * from the question's own `catalog` block, so a menu, a listings sheet and a
   * product list are the same input with different words around it.
   */
  | "catalog";

/** Where a website scrape may pre-fill this answer (used by the phase-2 pass). */
export type PrefillSource =
  | "identity.description"
  | "identity.offerings"
  | "identity.industry"
  | "policies.hours"
  | "policies.shipping"
  | "policies.refunds"
  | "policies.pricing"
  | "voice.tone"
  | "voice.languages";

export interface Question {
  /** Stable key. Answers are stored under this — renaming one orphans data. */
  id: string;
  label: string;
  /** One line under the label. Explain why we ask, not how to answer. */
  help?: string;
  input: InputType;
  /** For single_select / chips / chips_plus_text. */
  options?: readonly string[];
  /** Let the user add their own chip. Default true for chips-style inputs. */
  allowCustom?: boolean;
  placeholder?: string;
  /** Only show when another answer is set (switch true, or select equals). */
  showIf?: { question: string; equals?: string | boolean };
  /** Prefix used when this answer is rendered as a fact for the AI. Falls
   *  back to the label, which is phrased as a question and reads oddly. */
  factLabel?: string;
  /** Marks the handful of questions worth nudging about if left empty. */
  important?: boolean;
  prefillFrom?: PrefillSource;
  /** Required by `input: "catalog"`, ignored otherwise. */
  catalog?: CatalogQuestion;
}

/**
 * Per-vertical dressing for a catalog import.
 *
 * `attributeHints` biases the extractor's PROMPT and nothing else — it is never
 * a schema and never validates output. A listings sheet that happens to carry a
 * "floor" column keeps it, and a menu that carries none of these still imports.
 * Hard-coding fields per vertical is exactly what this avoids.
 */
export interface CatalogQuestion {
  /** Plural noun for the collection: "menu", "listings", "products". */
  noun: string;
  /** Singular noun for one row: "dish", "listing", "product". */
  itemNoun: string;
  /** Example attribute names, passed to the model as hints only. */
  attributeHints: readonly string[];
  /** Shown in the paste box. */
  pastePlaceholder?: string;
}

export interface Vertical {
  id: string;
  label: string;
  /** Shown on the picker card — how the owner recognises themselves. */
  blurb: string;
  /** Lowercase substrings matched against the scraped industry for detection. */
  match: readonly string[];
  questions: readonly Question[];
}

// ── Answer values ───────────────────────────────────────────────────────────

export interface DayHours {
  /** Closed days carry no times, so "closed" is representable, not implied. */
  closed: boolean;
  open?: string;
  close?: string;
}
export type WeeklyHours = Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  DayHours
>;

export interface PriceRange {
  from?: number;
  to?: number;
  currency?: string;
  /** "It depends" is a real answer and better than a made-up number. */
  varies?: boolean;
}

export interface ChipsPlusText {
  selected: string[];
  text?: string;
}

/**
 * One catalog row. Flat on purpose — the review table maps 1:1 to these.
 *
 * `price` stays a STRING. Real catalogs say "45k", "AED 85,000/yr", "from $12",
 * "12–18", "حسب الطلب". Coercing to a number forces a currency decision, loses
 * ranges, and invents precision the source never had. Nothing downstream does
 * arithmetic — the model grounds on rendered text.
 */
export interface CatalogRow {
  /** Stable id for the review table. Client-side only; nothing persists it. */
  id: string;
  name: string;
  price?: string;
  description?: string;
  /**
   * Whatever else THIS item had. Per-item, not per-vertical: two rows in one
   * catalog may legitimately carry different keys.
   */
  attributes?: Record<string, string>;
  /**
   * Why the row needs a human. Presence marks it in the table — a row we could
   * not read is surfaced for correction, never dropped silently.
   */
  issue?: string;
  /** Source text for a row we could not parse into fields. */
  raw?: string;
}

/**
 * What the ANSWER stores — a receipt, not the items.
 *
 * The items themselves become `knowledge_items` rows on confirm, which is what
 * makes them retrievable per-question instead of riding along in every context
 * pack. Keeping a second copy here would bloat `business_profiles.answers` and
 * create two sources of truth. Re-editing happens in the Knowledge view.
 */
export interface CatalogAnswer {
  count: number;
  source: "file" | "paste" | "manual";
  sourceName?: string;
  importedAt: string;
}

export type AnswerValue =
  | string
  | boolean
  | string[]
  | WeeklyHours
  | PriceRange
  | ChipsPlusText
  | CatalogAnswer;

/** Upper bound on one import. Bounds the confirm transaction and embed fan-out. */
export const CATALOG_MAX_ITEMS = 500;

/**
 * Stored answers. `guessed` lists ids the AI pre-filled and the user has not
 * yet touched — the UI marks those so an owner is correcting rather than
 * trusting. Once edited, an id leaves `guessed` and becomes their own answer.
 */
export interface BrainAnswers {
  vertical?: string;
  values: Record<string, AnswerValue>;
  guessed?: string[];
  completedAt?: string;
}

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
