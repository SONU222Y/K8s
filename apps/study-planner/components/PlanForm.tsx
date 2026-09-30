"use client";

import { useRef, useState, type FormEvent } from "react";
import { addDays, daysBetween } from "@/lib/scheduler";
import type { PlanRequest } from "@/lib/types";
import { formatDayWithYear, isValidIsoDate } from "./dates";
import LoadingPanel from "./LoadingPanel";
import { SAMPLE_SYLLABUS } from "./sampleSyllabus";

const MAX_SYLLABUS_CHARS = 50_000;
const MAX_PLAN_DAYS = 366;
const MIN_HOURS = 0.5;
const MAX_HOURS = 16;

type FieldName = "syllabus" | "examDate" | "hoursPerDay" | "startDate";
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormValues {
  syllabus: string;
  examDate: string;
  hoursPerDay: string;
  startDate: string;
}

interface PlanFormProps {
  today: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (request: PlanRequest) => void;
  onCancel: () => void;
}

function validate(values: FormValues, today: string): { errors: FieldErrors; request?: PlanRequest } {
  const errors: FieldErrors = {};
  const syllabus = values.syllabus.trim();
  if (!syllabus) {
    errors.syllabus = "Paste your syllabus or topic list.";
  } else if (syllabus.length < 20) {
    errors.syllabus = "That looks too short. Paste the full list of topics from your syllabus.";
  } else if (syllabus.length > MAX_SYLLABUS_CHARS) {
    errors.syllabus = `The syllabus is too long (max ${MAX_SYLLABUS_CHARS.toLocaleString("en")} characters).`;
  }

  const startDate = values.startDate || today;
  if (values.startDate && !isValidIsoDate(values.startDate)) {
    errors.startDate = "Enter a valid start date.";
  } else if (today && startDate < today) {
    errors.startDate = "The start date can't be in the past.";
  }

  if (!values.examDate) {
    errors.examDate = "Enter the date of your exam.";
  } else if (!isValidIsoDate(values.examDate)) {
    errors.examDate = "Enter a valid exam date.";
  } else if (today && values.examDate <= today) {
    errors.examDate = "The exam date must be in the future.";
  } else if (!errors.startDate && values.examDate <= startDate) {
    errors.examDate = "The exam date must be after the start date.";
  } else if (!errors.startDate && daysBetween(startDate, values.examDate) > MAX_PLAN_DAYS) {
    errors.examDate = "Plans can cover at most one year. Pick a later start date or an earlier exam.";
  }

  const hours = Number(values.hoursPerDay);
  if (values.hoursPerDay.trim() === "" || !Number.isFinite(hours)) {
    errors.hoursPerDay = "Enter how many hours you can study per day.";
  } else if (hours < MIN_HOURS || hours > MAX_HOURS) {
    errors.hoursPerDay = `Choose between ${MIN_HOURS} and ${MAX_HOURS} hours.`;
  } else if (!Number.isInteger(hours * 2)) {
    errors.hoursPerDay = "Use steps of half an hour (for example 1.5 or 2).";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    request: {
      syllabus,
      examDate: values.examDate,
      hoursPerDay: hours,
      startDate,
    },
  };
}

export default function PlanForm({ today, submitting, error, onSubmit, onCancel }: PlanFormProps) {
  const [values, setValues] = useState<FormValues>({
    syllabus: "",
    examDate: "",
    hoursPerDay: "2",
    startDate: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const refs = {
    syllabus: useRef<HTMLTextAreaElement>(null),
    startDate: useRef<HTMLInputElement>(null),
    examDate: useRef<HTMLInputElement>(null),
    hoursPerDay: useRef<HTMLInputElement>(null),
  };

  const startDate = values.startDate || today;

  function setField(name: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function fillExample() {
    setField("syllabus", SAMPLE_SYLLABUS);
    if (!values.examDate && today) setField("examDate", addDays(today, 28));
    refs.syllabus.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const result = validate(values, today);
    setErrors(result.errors);
    if (!result.request) {
      const order: FieldName[] = ["syllabus", "startDate", "examDate", "hoursPerDay"];
      const first = order.find((name) => result.errors[name]);
      if (first) refs[first].current?.focus();
      return;
    }
    onSubmit(result.request);
  }

  function describedBy(name: FieldName, hintId?: string): string | undefined {
    const ids = [hintId, errors[name] ? `${name}-error` : undefined].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  }

  return (
    <section className="card form-card" aria-labelledby="form-heading">
      <h2 id="form-heading" tabIndex={-1}>
        Make your study plan
      </h2>
      <p className="muted">
        Paste your syllabus, tell us when the exam is and how much time you have. You&apos;ll get a
        day-by-day plan with time for revision at the end.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={submitting} className="form-fields">
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="syllabus">Syllabus</label>
              <button type="button" className="btn btn-link" onClick={fillExample}>
                Try an example
              </button>
            </div>
            <textarea
              id="syllabus"
              ref={refs.syllabus}
              rows={12}
              value={values.syllabus}
              onChange={(e) => setField("syllabus", e.target.value)}
              placeholder={"Unit 1: Cell Biology\n- Cell structure\n- Mitosis and meiosis\n\nUnit 2: ..."}
              aria-invalid={errors.syllabus ? true : undefined}
              aria-describedby={describedBy("syllabus", "syllabus-hint")}
              spellCheck={false}
            />
            <p id="syllabus-hint" className="hint">
              Units, chapters or a plain list of topics all work.{" "}
              <span className="char-count">
                {values.syllabus.length.toLocaleString("en")} / {MAX_SYLLABUS_CHARS.toLocaleString("en")}
              </span>
            </p>
            <FieldError name="syllabus" message={errors.syllabus} />
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="startDate">
                Start date <span className="optional">(optional)</span>
              </label>
              <input
                id="startDate"
                ref={refs.startDate}
                type="date"
                value={values.startDate || today}
                min={today || undefined}
                onChange={(e) => setField("startDate", e.target.value)}
                aria-invalid={errors.startDate ? true : undefined}
                aria-describedby={describedBy("startDate", "startDate-hint")}
              />
              <p id="startDate-hint" className="hint">
                Defaults to today.
              </p>
              <FieldError name="startDate" message={errors.startDate} />
            </div>

            <div className="field">
              <label htmlFor="examDate">Exam date</label>
              <input
                id="examDate"
                ref={refs.examDate}
                type="date"
                required
                value={values.examDate}
                min={startDate && isValidIsoDate(startDate) ? addDays(startDate, 1) : undefined}
                onChange={(e) => setField("examDate", e.target.value)}
                aria-invalid={errors.examDate ? true : undefined}
                aria-describedby={describedBy("examDate", "examDate-hint")}
              />
              <p id="examDate-hint" className="hint">
                {values.examDate && isValidIsoDate(values.examDate)
                  ? formatDayWithYear(values.examDate)
                  : "No studying is planned on exam day."}
              </p>
              <FieldError name="examDate" message={errors.examDate} />
            </div>

            <div className="field">
              <label htmlFor="hoursPerDay">Study hours per day</label>
              <input
                id="hoursPerDay"
                ref={refs.hoursPerDay}
                type="number"
                inputMode="decimal"
                required
                min={MIN_HOURS}
                max={MAX_HOURS}
                step={0.5}
                value={values.hoursPerDay}
                onChange={(e) => setField("hoursPerDay", e.target.value)}
                aria-invalid={errors.hoursPerDay ? true : undefined}
                aria-describedby={describedBy("hoursPerDay", "hoursPerDay-hint")}
              />
              <p id="hoursPerDay-hint" className="hint">
                Between {MIN_HOURS} and {MAX_HOURS}, in half hours.
              </p>
              <FieldError name="hoursPerDay" message={errors.hoursPerDay} />
            </div>
          </div>
        </fieldset>

        {error && (
          <div className="alert alert-error" role="alert">
            <strong>We couldn&apos;t make your plan.</strong> {error}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-large" disabled={submitting} aria-disabled={submitting}>
            {submitting ? "Building your plan…" : "Build my study plan"}
          </button>
          {submitting && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>

        {submitting && <LoadingPanel />}
      </form>
    </section>
  );
}

function FieldError({ name, message }: { name: FieldName; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${name}-error`} className="field-error">
      {message}
    </p>
  );
}
