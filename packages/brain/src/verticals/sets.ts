import { CORE_QUESTIONS } from "./core";
import { OTHER, VERTICALS } from "./definitions";
import { DAYS, type AnswerValue, type Question, type Vertical, type WeeklyHours } from "./types";

// Pure question-set logic. Kept out of the folder's barrel so `facts.ts` can
// use it without importing the barrel that re-exports `facts` itself — that
// cycle resolves at runtime but is exactly the kind of thing bundlers choke on.

export function getVertical(id: string | undefined | null): Vertical {
  return VERTICALS.find((v) => v.id === id) ?? OTHER;
}

/** Core questions first, then the vertical's own. Order is the asked order. */
export function getQuestionSet(verticalId: string | undefined | null): Question[] {
  return [...CORE_QUESTIONS, ...getVertical(verticalId).questions];
}

/**
 * Guess the vertical from the scraped industry string. Only ever PRE-SELECTS
 * the picker — the question stays on screen, so a wrong guess costs one tap.
 */
export function detectVertical(industry?: string | null): string {
  const text = (industry ?? "").toLowerCase().trim();
  if (!text) return OTHER.id;

  // Longest matching keyword wins, NOT registry order. "Wholesale food
  // distributor" contains both "food" and "distribut"; first-match-wins made
  // it a restaurant purely because restaurants are listed earlier.
  let best: { id: string; score: number } = { id: OTHER.id, score: 0 };
  for (const v of VERTICALS) {
    for (const m of v.match) {
      if (text.includes(m) && m.length > best.score) best = { id: v.id, score: m.length };
    }
  }
  return best.id;
}

/** A question is asked only when its `showIf` dependency is satisfied. */
export function isVisible(q: Question, values: Record<string, AnswerValue>): boolean {
  if (!q.showIf) return true;
  const dep = values[q.showIf.question];
  if (q.showIf.equals !== undefined) return dep === q.showIf.equals;
  return Array.isArray(dep) ? dep.length > 0 : dep !== undefined && dep !== "";
}

export function visibleQuestions(
  verticalId: string | undefined | null,
  values: Record<string, AnswerValue>,
): Question[] {
  return getQuestionSet(verticalId).filter((q) => isVisible(q, values));
}

/** True when an answer carries information — used for progress, never to block. */
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if ("selected" in value) return value.selected.length > 0 || !!value.text?.trim();
  // A price range may arrive with only some keys present, so discriminate on
  // ANY range key — testing "varies" alone let a half-empty range fall through
  // to the hours branch and crash.
  if ("varies" in value || "from" in value || "to" in value || "currency" in value) {
    return !!value.varies || value.from !== undefined || value.to !== undefined;
  }
  return DAYS.some((d) => {
    const day = (value as WeeklyHours)[d];
    return !!day && !day.closed && !!(day.open || day.close);
  });
}

export function answeredCount(
  verticalId: string | undefined | null,
  values: Record<string, AnswerValue>,
): { answered: number; total: number } {
  const qs = visibleQuestions(verticalId, values);
  return { answered: qs.filter((q) => isAnswered(values[q.id])).length, total: qs.length };
}
