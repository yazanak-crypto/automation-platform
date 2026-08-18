import { getQuestionSet } from "./index";
import {
  DAYS,
  DAY_LABELS,
  type AnswerValue,
  type ChipsPlusText,
  type PriceRange,
  type Question,
  type WeeklyHours,
} from "./types";

// Turn guided-setup answers into plain sentences the drafting model can ground
// on. The context pack is JSON.stringify'd straight into the prompt, so these
// strings ARE what the AI reads — they must be unambiguous and never imply
// more certainty than the owner gave.

/** Reads better as a fact prefix than the on-screen question. */
function factLabel(q: Question): string {
  return q.factLabel ?? q.label.replace(/\?$/, "");
}

function renderHours(v: WeeklyHours): string {
  const parts = DAYS.map((d) => {
    const day = v[d];
    if (!day || day.closed) return `${DAY_LABELS[d]}: closed`;
    return `${DAY_LABELS[d]}: ${day.open ?? "?"}–${day.close ?? "?"}`;
  });
  return parts.join("; ");
}

function renderPrice(v: PriceRange): string {
  // "Varies" is a real answer and must read as a refusal to quote, not as a
  // missing number the model might fill in itself.
  if (v.varies) return "varies — do not quote a specific price";
  const cur = v.currency ?? "";
  if (v.from !== undefined && v.to !== undefined) return `${v.from}–${v.to} ${cur}`.trim();
  if (v.from !== undefined) return `from ${v.from} ${cur}`.trim();
  if (v.to !== undefined) return `up to ${v.to} ${cur}`.trim();
  return "";
}

function renderValue(q: Question, value: AnswerValue): string {
  switch (q.input) {
    case "switch":
      return value === true ? "yes" : "no";
    case "weekly_hours":
      return renderHours(value as WeeklyHours);
    case "price_range":
      return renderPrice(value as PriceRange);
    case "chips":
    case "list":
      return (value as string[]).join(", ");
    case "chips_plus_text": {
      const v = value as ChipsPlusText;
      return [v.selected.join(", "), v.text?.trim()].filter(Boolean).join(" — ");
    }
    default:
      return String(value).trim();
  }
}

export interface AnswerFacts {
  /** Statements of fact the AI may answer from. */
  facts: string[];
  /** Hard rules from "what should your AI never do" — these become boundaries. */
  rules: string[];
}

/**
 * Render answers into facts and rules.
 *
 * `guessed` ids are EXCLUDED. They were pre-filled by the AI from the website
 * and not yet corrected by the owner, and the context pack's rule is that only
 * confirmed information enters it. Grounding a customer-facing reply on our own
 * guess would launder an inference into a stated fact.
 */
export function renderAnswerFacts(input: {
  vertical?: string;
  values?: Record<string, unknown>;
  guessed?: string[];
}): AnswerFacts {
  const values = (input.values ?? {}) as Record<string, AnswerValue>;
  const guessed = new Set(input.guessed ?? []);
  const facts: string[] = [];
  const rules: string[] = [];

  for (const q of getQuestionSet(input.vertical)) {
    const value = values[q.id];
    if (value === undefined || guessed.has(q.id)) continue;

    if (q.id === "never_do") {
      const v = value as ChipsPlusText;
      for (const item of v.selected ?? []) rules.push(`Never ${item.toLowerCase()}`);
      if (v.text?.trim()) rules.push(v.text.trim());
      continue;
    }

    const rendered = renderValue(q, value);
    if (!rendered) continue;
    facts.push(`${factLabel(q)}: ${rendered}`);
  }

  return { facts, rules };
}
