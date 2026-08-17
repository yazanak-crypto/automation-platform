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
  | "list";

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

export type AnswerValue =
  | string
  | boolean
  | string[]
  | WeeklyHours
  | PriceRange
  | ChipsPlusText;

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
