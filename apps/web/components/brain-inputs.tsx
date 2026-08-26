"use client";

import { useState } from "react";
import { CatalogImport } from "./catalog-import";
import {
  DAYS,
  DAY_LABELS,
  type AnswerValue,
  type CatalogAnswer,
  type ChipsPlusText,
  type PriceRange,
  type Question,
  type WeeklyHours,
} from "@platform/brain/verticals";

// Input widgets for the guided Brain setup. One component per input TYPE —
// never per question — so a new vertical is a data file and nothing more.

const CARD =
  "w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors";
const CHIP =
  "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors select-none";
const FIELD =
  "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm focus:border-line-strong focus:outline-none";

function emptyWeek(): WeeklyHours {
  return Object.fromEntries(
    DAYS.map((d) => [d, { closed: d === "sun", open: "09:00", close: "18:00" }]),
  ) as WeeklyHours;
}

/** Toggleable chips, with optional free-form additions. */
function Chips({
  options,
  selected,
  onChange,
  allowCustom,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const custom = selected.filter((s) => !options.includes(s));
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {[...options, ...custom].map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(opt)}
              className={`${CHIP} ${
                on
                  ? "border-brass bg-brass-dim text-ink"
                  : "border-line text-ink-2 hover:border-line-strong"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {allowCustom !== false && (
        <div className="mt-2.5 flex gap-2">
          <input
            className={`${FIELD} max-w-[240px]`}
            value={draft}
            placeholder="Add your own…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = draft.trim();
              if (v && !selected.includes(v)) onChange([...selected, v]);
              setDraft("");
            }}
          />
          <button
            type="button"
            onClick={() => {
              const v = draft.trim();
              if (v && !selected.includes(v)) onChange([...selected, v]);
              setDraft("");
            }}
            className="rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-hover"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/** Per-day schedule. Closed is a first-class state, not an empty field. */
function WeeklyHoursInput({
  value,
  onChange,
}: {
  value?: WeeklyHours;
  onChange: (v: WeeklyHours) => void;
}) {
  const week = value ?? emptyWeek();
  const set = (day: (typeof DAYS)[number], patch: Partial<WeeklyHours[typeof day]>) =>
    onChange({ ...week, [day]: { ...week[day], ...patch } });

  return (
    <div className="space-y-1.5">
      {DAYS.map((d) => {
        const day = week[d];
        return (
          <div key={d} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-ink-2">{DAY_LABELS[d]}</span>
            <button
              type="button"
              onClick={() => set(d, { closed: !day.closed })}
              className={`${CHIP} shrink-0 ${
                day.closed
                  ? "border-line text-ink-3"
                  : "border-brass bg-brass-dim text-ink"
              }`}
            >
              {day.closed ? "Closed" : "Open"}
            </button>
            {!day.closed && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={day.open ?? "09:00"}
                  onChange={(e) => set(d, { open: e.target.value })}
                  className="rounded-lg border border-line bg-raised px-2 py-1 text-sm"
                />
                <span className="text-ink-3">→</span>
                <input
                  type="time"
                  value={day.close ?? "18:00"}
                  onChange={(e) => set(d, { close: e.target.value })}
                  className="rounded-lg border border-line bg-raised px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          // Copying Monday is the single most common shortcut; without it this
          // is fourteen taps to say "the same every weekday".
          const mon = week.mon;
          onChange({
            ...week,
            tue: { ...mon },
            wed: { ...mon },
            thu: { ...mon },
            fri: { ...mon },
          });
        }}
        className="mt-1 text-[12px] text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
      >
        Apply Monday to all weekdays
      </button>
    </div>
  );
}

function PriceRangeInput({
  value,
  onChange,
}: {
  value?: PriceRange;
  onChange: (v: PriceRange) => void;
}) {
  const v = value ?? {};
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${FIELD} max-w-[110px]`}
          inputMode="decimal"
          placeholder="From"
          value={v.from ?? ""}
          disabled={v.varies}
          onChange={(e) =>
            onChange({ ...v, from: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
        <span className="text-ink-3">→</span>
        <input
          className={`${FIELD} max-w-[110px]`}
          inputMode="decimal"
          placeholder="To"
          value={v.to ?? ""}
          disabled={v.varies}
          onChange={(e) =>
            onChange({ ...v, to: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
        {/* Free text, not a list. A fixed set locked out every currency we
            failed to think of — AED, SAR, QAR, KWD were all unenterable — and
            no list we write will be complete. Short and uppercased so it
            still reads as a currency code. */}
        <input
          className={`${FIELD} max-w-[90px] uppercase`}
          maxLength={4}
          placeholder="USD"
          value={v.currency ?? ""}
          disabled={v.varies}
          aria-label="Currency"
          onChange={(e) => onChange({ ...v, currency: e.target.value.toUpperCase() })}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...v, varies: !v.varies })}
        className={`mt-2 ${CHIP} ${
          v.varies ? "border-brass bg-brass-dim text-ink" : "border-line text-ink-2"
        }`}
      >
        It depends — don&apos;t quote a price
      </button>
    </div>
  );
}

function ListInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const items = value ?? [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span>{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-ink-3 hover:text-stop"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={FIELD}
          value={draft}
          placeholder={placeholder ?? "Add one…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-hover"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** Renders whichever widget the question's `input` type calls for. */
export function QuestionInput({
  question,
  value,
  onChange,
  vertical,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  /** Required by `input: "catalog"`, which tailors extraction to the vertical. */
  vertical?: string;
}) {
  switch (question.input) {
    case "catalog":
      // The question carries its own copy and extraction hints, so this stays
      // one branch no matter how many verticals import a catalog.
      if (!question.catalog || !vertical) return null;
      return (
        <CatalogImport
          question={question.catalog}
          vertical={vertical}
          questionId={question.id}
          value={value as CatalogAnswer | undefined}
          onChange={onChange}
        />
      );

    case "short_text":
      return (
        <input
          className={FIELD}
          value={(value as string) ?? ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "long_text":
      return (
        <textarea
          className={FIELD}
          rows={3}
          value={(value as string) ?? ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "single_select":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(question.options ?? []).map((opt) => {
            const on = value === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(opt)}
                className={`${CARD} ${
                  on
                    ? "border-brass bg-brass-dim"
                    : "border-line hover:border-line-strong"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );

    case "chips":
      return (
        <Chips
          options={question.options ?? []}
          selected={(value as string[]) ?? []}
          onChange={onChange}
          allowCustom={question.allowCustom}
        />
      );

    case "chips_plus_text": {
      const v = (value as ChipsPlusText) ?? { selected: [] };
      return (
        <div className="space-y-2.5">
          <Chips
            options={question.options ?? []}
            selected={v.selected}
            onChange={(selected) => onChange({ ...v, selected })}
            allowCustom={question.allowCustom}
          />
          <textarea
            className={FIELD}
            rows={2}
            value={v.text ?? ""}
            placeholder={question.placeholder}
            onChange={(e) => onChange({ ...v, text: e.target.value })}
          />
        </div>
      );
    }

    case "switch": {
      const on = value === true;
      return (
        <div className="flex gap-2">
          {[
            { label: "Yes", val: true },
            { label: "No", val: false },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={value === o.val}
              onClick={() => onChange(o.val)}
              className={`${CHIP} px-5 py-2 ${
                value === o.val
                  ? "border-brass bg-brass-dim text-ink"
                  : "border-line text-ink-2 hover:border-line-strong"
              }`}
            >
              {o.label}
            </button>
          ))}
          {value === undefined && (
            <span className="self-center text-[12px] text-ink-3">Not answered yet</span>
          )}
          {on && null}
        </div>
      );
    }

    case "weekly_hours":
      return <WeeklyHoursInput value={value as WeeklyHours} onChange={onChange} />;

    case "price_range":
      return <PriceRangeInput value={value as PriceRange} onChange={onChange} />;

    case "list":
      return (
        <ListInput
          value={value as string[]}
          onChange={onChange}
          placeholder={question.placeholder}
        />
      );
  }
}
