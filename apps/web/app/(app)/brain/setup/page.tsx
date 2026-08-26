"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VERTICALS,
  answeredCount,
  detectVertical,
  visibleQuestions,
  type AnswerValue,
} from "@platform/brain/verticals";
import { QuestionInput } from "@/components/brain-inputs";
import { Page, PageHeader, SkeletonRows } from "@/components/ui";

// Guided Brain setup: one question per screen, tailored to the business type.
// The advanced Knowledge view at /brain is untouched — this is the front door,
// not a replacement.

type Values = Record<string, AnswerValue>;

export default function BrainSetupPage() {
  const [loaded, setLoaded] = useState(false);
  const [vertical, setVertical] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({});
  const [guessed, setGuessed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "failed">("idle");
  const [done, setDone] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/brain/answers").catch(() => null);
      if (res?.ok) {
        const d = await res.json();
        setValues((d.values ?? {}) as Values);
        setGuessed(d.guessed ?? []);
        // Pre-select from the scraped industry, but the picker still shows —
        // a wrong guess costs one tap, never a wrong question set.
        setVertical(d.vertical ?? (d.detectedIndustry ? detectVertical(d.detectedIndustry) : null));
      }
      setLoaded(true);
    })();
  }, []);

  // Patches ACCUMULATE between flushes. The debounce clears its previous
  // timer, so without this, tapping Next through several pre-filled answers
  // would keep cancelling the pending save and only the last confirmation
  // would ever reach the server.
  const pending = useRef<{ values: Values; vertical?: string; completed?: boolean }>({
    values: {},
  });

  const save = useCallback(
    (patch: { values?: Values; vertical?: string; completed?: boolean }) => {
      pending.current = {
        values: { ...pending.current.values, ...(patch.values ?? {}) },
        vertical: patch.vertical ?? pending.current.vertical,
        completed: patch.completed || pending.current.completed,
      };
      setSaving("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const body = pending.current;
        pending.current = { values: {} };
        const res = await fetch("/api/brain/answers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null);
        if (!res?.ok) {
          // Put it back so the next save retries it rather than losing it.
          pending.current = {
            values: { ...body.values, ...pending.current.values },
            vertical: pending.current.vertical ?? body.vertical,
            completed: pending.current.completed || body.completed,
          };
        }
        setSaving(res?.ok ? "idle" : "failed");
      }, 500);
    },
    [],
  );

  const questions = useMemo(
    () => (vertical ? visibleQuestions(vertical, values) : []),
    [vertical, values],
  );
  const progress = useMemo(
    () => (vertical ? answeredCount(vertical, values) : { answered: 0, total: 0 }),
    [vertical, values],
  );

  function setAnswer(id: string, v: AnswerValue) {
    const next = { ...values, [id]: v };
    setValues(next);
    setGuessed((g) => g.filter((x) => x !== id)); // now it's their answer
    save({ values: { [id]: v } });
  }

  /**
   * Some inputs hold work that is staged rather than answered — the catalog
   * import stages reviewed rows that only become knowledge on confirm. Those
   * register a commit here, and Next runs it before moving on.
   *
   * This exists because the alternative shipped and lost data: the catalog
   * step had its own "Save" button sitting directly above the wizard's Next,
   * and pressing Next silently discarded every reviewed row. Production logs
   * showed exactly that — two successful extractions, no confirm call, nothing
   * saved.
   *
   * Kept generic on purpose. The wizard must not know what a catalog is (see
   * the rule at the top of verticals/types.ts); any future input with staged
   * state uses the same hook.
   */
  // A half-answered "discard them?" must not follow the owner to the next
  // question, where it would read as being about something else.
  useEffect(() => setConfirmSkip(false), [index]);

  const commitRef = useRef<null | (() => Promise<boolean>)>(null);
  const registerCommit = useCallback((fn: null | (() => Promise<boolean>)) => {
    commitRef.current = fn;
  }, []);

  if (!loaded) {
    return (
      <Page>
        <PageHeader title="Set up your Business Brain" />
        <SkeletonRows rows={4} />
      </Page>
    );
  }

  // ── Step 1: which business are you? ───────────────────────────────────────
  if (!vertical) {
    return (
      <Page>
        <PageHeader
          title="What kind of business are you?"
          subtitle="We'll only ask the questions that matter for your type of business."
        />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setVertical(v.id);
                save({ vertical: v.id });
              }}
              className="rise rounded-xl border border-line p-4 text-left transition-colors hover:border-line-strong hover:bg-hover"
            >
              <p className="text-sm font-medium">{v.label}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{v.blurb}</p>
            </button>
          ))}
        </div>
      </Page>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (done || index >= questions.length) {
    return (
      <Page>
        <PageHeader
          title="Your Brain is set up"
          subtitle={`${progress.answered} of ${progress.total} questions answered — you can change any of it any time.`}
        />
        <div className="flex flex-wrap gap-3">
          <Link
            href="/brain"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            See everything your AI knows
          </Link>
          <button
            onClick={() => {
              setDone(false);
              setIndex(0);
            }}
            className="rounded-lg border border-line px-5 py-2.5 text-sm"
          >
            Go through it again
          </button>
        </div>
        <p className="mt-6 text-sm text-ink-2">
          Anything you left blank simply won&apos;t be answered automatically — your AI brings
          those to you instead of guessing.
        </p>
      </Page>
    );
  }

  const q = questions[index]!;
  const isGuess = guessed.includes(q.id);

  /**
   * Moving forward past a pre-filled answer IS the confirmation — requiring a
   * separate tap would undo the point of pre-filling. Until confirmed, an
   * answer stays in `guessed` and is excluded from the context pack, so it
   * cannot ground a reply to a customer.
   */
  async function advance() {
    // Staged work is committed FIRST. If it fails we stay on the question —
    // the input surfaces its own error, and moving on would drop the work.
    const commit = commitRef.current;
    if (commit) {
      setCommitting(true);
      const ok = await commit();
      setCommitting(false);
      if (!ok) return;
    }

    const last = index + 1 >= questions.length;
    const confirming = isGuess && values[q.id] !== undefined;
    const patch: { values?: Values; completed?: boolean } = {};
    if (confirming) patch.values = { [q.id]: values[q.id]! };
    if (last) patch.completed = true;

    if (confirming) setGuessed((g) => g.filter((x) => x !== q.id));
    if (Object.keys(patch).length > 0) save(patch);
    if (last) setDone(true);
    else setIndex((i) => i + 1);
  }

  /**
   * Skip. Normally silent — a skipped question is simply unanswered.
   *
   * But skipping past STAGED work throws it away, so that one case asks first.
   * Two-step inline rather than a confirm() dialog: the wizard is one calm
   * question per screen and a browser modal does not belong in it.
   */
  function skip() {
    if (commitRef.current && !confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    setConfirmSkip(false);
    setIndex((i) => i + 1);
  }

  return (
    <Page>
      <PageHeader
        title="Set up your Business Brain"
        subtitle={`Question ${index + 1} of ${questions.length}`}
        back={{ href: "/brain", label: "Knowledge" }}
      />

      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-hover">
        <div
          className="h-full rounded-full bg-brass transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div key={q.id} className="rise">
        <h2 className="text-lg font-medium">{q.label}</h2>
        {q.help && <p className="mt-1 text-sm leading-relaxed text-ink-2">{q.help}</p>}
        {isGuess && (
          <p className="mt-2 inline-block rounded-md bg-brass-dim px-2 py-1 text-[12px] text-brass">
            From your website — confirm it&apos;s right, or edit it
          </p>
        )}

        <div className="mt-4">
          <QuestionInput
            question={q}
            value={values[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
            vertical={vertical}
            registerCommit={registerCommit}
          />
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          className="text-sm text-ink-3 disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={() => void advance()}
          disabled={committing}
          className="press-glow rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          {committing
            ? "Saving…"
            : index + 1 >= questions.length
              ? "Finish"
              : isGuess
                ? "Looks right"
                : "Next"}
        </button>
        {/* Skip does NOT confirm a pre-filled answer — one skipped past stays a
            guess, and guesses never ground a customer-facing reply. It DOES ask
            before discarding staged work (see skip()). */}
        <button onClick={skip} className="text-sm text-ink-3 hover:text-ink-2">
          {confirmSkip ? "Yes, discard them" : "Skip"}
        </button>
        {confirmSkip && (
          <button
            onClick={() => setConfirmSkip(false)}
            className="text-sm text-ink-2 underline underline-offset-4"
          >
            Keep them
          </button>
        )}
        <span className="ml-auto text-[12px] text-ink-3">
          {saving === "saving" ? "Saving…" : saving === "failed" ? "Not saved — retrying" : "Saved"}
        </span>
      </div>
    </Page>
  );
}
