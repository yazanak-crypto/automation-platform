import { callAi } from "@platform/ai";
import {
  PREFILL_PROMPT_REF,
  PREFILL_PROMPT_VERSION,
  PREFILL_SYSTEM,
  prefillUserPrompt,
} from "./prefillPrompt";
import {
  getQuestionSet,
  type AnswerValue,
  type PriceRange,
  type Question,
  type WeeklyHours,
} from "./verticals";
import { DAYS } from "./verticals/types";

// Vertical-aware prefill: validation, not trust.
//
// A model asked to fill a schema WILL fill it. So the three rules we agreed
// are enforced here, after the model has spoken, rather than only asked for in
// the prompt:
//
//   1. Every value needs a source sentence, and that sentence must actually
//      appear in the scraped pages. Unevidenced or fabricated → dropped.
//   2. Booleans are never inferred from absence. A site that doesn't mention
//      returns is not a site that says "no returns".
//   3. Partial structures beat confident ones. Weekday hours with no Saturday
//      stay partial rather than assuming closed.
//
// Everything that survives is marked `guessed`, so it is excluded from the
// context pack until the owner confirms it in the flow.

export interface RawPrefillAnswer {
  questionId: string;
  value: unknown;
  /** Verbatim sentence from the site that states this. */
  evidence?: string;
}

export interface PrefillResult {
  values: Record<string, AnswerValue>;
  guessed: string[];
  /** Why each rejected answer was dropped — surfaced in logs, not to the user. */
  rejected: { questionId: string; reason: string }[];
}

/** Loose comparison so quoting differences don't defeat the evidence check. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceAppears(evidence: string, haystack: string): boolean {
  const e = normalise(evidence);
  // Very short "evidence" proves nothing — a stray word would match anything.
  if (e.length < 12) return false;
  return haystack.includes(e);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate one value against its question's input type. Returns null when the
 * shape is wrong — a wrong-shaped answer is dropped, never coerced into
 * something plausible.
 */
function validateValue(q: Question, raw: unknown): AnswerValue | null {
  switch (q.input) {
    case "catalog":
      // Never accept a prefilled catalog. The receipt shape is trivial to
      // forge from a scrape ({count: 12}) and would mark the step answered
      // while no knowledge items exist behind it.
      return null;
    case "short_text":
    case "long_text": {
      if (typeof raw !== "string") return null;
      const v = raw.trim();
      return v ? v : null;
    }

    case "single_select": {
      if (typeof raw !== "string") return null;
      // Must be one of ours. A model-invented option would render as a choice
      // the owner never offered.
      return (q.options ?? []).includes(raw) ? raw : null;
    }

    case "chips": {
      if (!Array.isArray(raw)) return null;
      const items = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      return items.length ? items.map((s) => s.trim()) : null;
    }

    case "chips_plus_text": {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as { selected?: unknown; text?: unknown };
      const selected = Array.isArray(r.selected)
        ? r.selected.filter((x): x is string => typeof x === "string")
        : [];
      const text = typeof r.text === "string" ? r.text.trim() : undefined;
      return selected.length || text ? { selected, text } : null;
    }

    case "switch":
      // Rule 2. Only an explicit boolean survives, and the evidence check above
      // has already required a sentence that states it.
      return typeof raw === "boolean" ? raw : null;

    case "price_range": {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Partial<PriceRange>;
      const out: PriceRange = {};
      if (typeof r.from === "number" && Number.isFinite(r.from)) out.from = r.from;
      if (typeof r.to === "number" && Number.isFinite(r.to)) out.to = r.to;
      if (typeof r.currency === "string" && r.currency.trim()) out.currency = r.currency.trim();
      if (r.varies === true) out.varies = true;
      return out.varies || out.from !== undefined || out.to !== undefined ? out : null;
    }

    case "weekly_hours": {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Record<string, unknown>;
      const week: Partial<WeeklyHours> = {};
      for (const d of DAYS) {
        const day = r[d];
        if (typeof day !== "object" || day === null) continue; // rule 3: leave unset
        const dd = day as { closed?: unknown; open?: unknown; close?: unknown };
        if (dd.closed === true) {
          week[d] = { closed: true };
          continue;
        }
        const open = typeof dd.open === "string" && TIME.test(dd.open) ? dd.open : undefined;
        const close = typeof dd.close === "string" && TIME.test(dd.close) ? dd.close : undefined;
        // A day with no usable times is left out rather than guessed closed.
        if (open || close) week[d] = { closed: false, open, close };
      }
      return Object.keys(week).length ? (week as WeeklyHours) : null;
    }

    case "list": {
      if (!Array.isArray(raw)) return null;
      const items = raw
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length ? items : null;
    }
  }
}

/**
 * Turn a model's proposed answers into prefill we're willing to show.
 *
 * `pageText` is the concatenated scraped text the model was given; evidence is
 * checked against it so the model cannot invent a supporting quote.
 */
export function validatePrefill(
  vertical: string | undefined,
  proposed: RawPrefillAnswer[],
  pageText: string,
): PrefillResult {
  const questions = new Map(getQuestionSet(vertical).map((q) => [q.id, q]));
  const haystack = normalise(pageText);
  const values: Record<string, AnswerValue> = {};
  const rejected: { questionId: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const item of proposed) {
    const q = questions.get(item.questionId);
    if (!q) {
      rejected.push({ questionId: item.questionId, reason: "not a question in this vertical" });
      continue;
    }
    if (seen.has(q.id)) {
      rejected.push({ questionId: q.id, reason: "duplicate" });
      continue;
    }
    // Rule 1, first half: no sentence, no answer.
    if (typeof item.evidence !== "string" || !item.evidence.trim()) {
      rejected.push({ questionId: q.id, reason: "no source sentence" });
      continue;
    }
    // Rule 1, second half: the sentence must genuinely be on the site.
    if (!evidenceAppears(item.evidence, haystack)) {
      rejected.push({ questionId: q.id, reason: "source sentence not found on the site" });
      continue;
    }
    const value = validateValue(q, item.value);
    if (value === null) {
      rejected.push({ questionId: q.id, reason: `value did not fit ${q.input}` });
      continue;
    }
    values[q.id] = value;
    seen.add(q.id);
  }

  return { values, guessed: Object.keys(values), rejected };
}

/**
 * Run the vertical-aware prefill pass: one model call, then validation.
 *
 * Kept separate from `validatePrefill` so the rules stay testable without a
 * model. Returns empty rather than throwing on unparseable output — prefill is
 * a convenience, and losing it must never cost the owner their profile.
 */
export async function runPrefillPass(input: {
  workspaceId: string;
  vertical: string;
  pages: { url: string; title: string; text: string }[];
  brainVersion: number;
}): Promise<PrefillResult> {
  const res = await callAi({
    workspaceId: input.workspaceId,
    promptRef: PREFILL_PROMPT_REF,
    promptVersion: PREFILL_PROMPT_VERSION,
    tier: "frontier",
    system: PREFILL_SYSTEM,
    prompt: prefillUserPrompt({ vertical: input.vertical, pages: input.pages }),
    maxTokens: 4096,
    brainVersion: input.brainVersion,
  });

  const raw = res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let proposed: RawPrefillAnswer[];
  try {
    const parsed = JSON.parse(raw) as { answers?: unknown };
    proposed = Array.isArray(parsed.answers) ? (parsed.answers as RawPrefillAnswer[]) : [];
  } catch {
    return { values: {}, guessed: [], rejected: [{ questionId: "*", reason: "unparseable output" }] };
  }

  // Evidence is checked against the same text the model was shown.
  const pageText = input.pages.map((p) => p.text).join("\n");
  const result = validatePrefill(input.vertical, proposed, pageText);
  if (result.rejected.length > 0) {
    console.log(
      `[brain.prefill] kept ${result.guessed.length}, dropped ${result.rejected.length}:`,
      result.rejected.map((r) => `${r.questionId} (${r.reason})`).join(", "),
    );
  }
  return result;
}
