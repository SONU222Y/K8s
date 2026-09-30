import type { PlanInput, StudyDay, StudyPlan, StudySession, Topic } from "./types";

// The scheduler is plain code on purpose: date arithmetic and packing hours into
// days must be exact, which is something a language model is not reliable at.

const STEP = 0.5; // smallest block of study time, in hours
const EPS = 1e-9;

export function roundToStep(hours: number): number {
  return Math.round(hours / STEP) * STEP;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Days kept free for revision at the end: about 15% of the time, between 1 and 7 days. */
export function revisionDayCount(totalDays: number): number {
  if (totalDays < 3) return 0;
  return Math.min(7, Math.max(1, Math.round(totalDays * 0.15)));
}

export function buildPlan(input: PlanInput): StudyPlan {
  const warnings: string[] = [];
  const done = new Set(input.completedIds ?? []);
  const topics = input.topics.filter((t) => !done.has(t.id));
  // Time is packed in 0.5h blocks, so 1.25h per day really means 1h.
  const hoursPerDay = Math.floor(input.hoursPerDay / STEP + EPS) * STEP;
  const totalDays = daysBetween(input.startDate, input.examDate);

  if (!(hoursPerDay > 0)) {
    return { days: [], overflowHours: 0, warnings: [`Hours per day must be at least ${STEP}.`] };
  }
  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    return {
      days: [],
      overflowHours: topics.reduce((sum, t) => sum + t.hours, 0),
      warnings: ["The exam date must be after the start date."],
    };
  }

  const days: StudyDay[] = Array.from({ length: totalDays }, (_, i) => ({
    date: addDays(input.startDate, i),
    sessions: [],
  }));
  if (topics.length === 0) return { days, overflowHours: 0, warnings };

  const needed = topics.reduce((sum, t) => sum + t.hours, 0);
  let revisionDays = revisionDayCount(totalDays);
  // Give up revision days (keeping one) before squeezing the learning time.
  if (needed > (totalDays - revisionDays) * hoursPerDay + EPS && revisionDays > 1) {
    revisionDays = 1;
    warnings.push("Time is tight, so only the last day is kept for revision.");
  }
  const learnDays = totalDays - revisionDays;
  const capacity = learnDays * hoursPerDay;

  // If the estimates still don't fit, shrink every topic by the same ratio.
  let learnHours = topics.map((t) => t.hours);
  if (needed > capacity + EPS) {
    const scale = capacity / needed;
    learnHours = scaleToFit(learnHours, scale, capacity);
    warnings.push(
      `The syllabus needs about ${roundToStep(needed)} hours but only ${capacity} are available, ` +
        `so each topic gets about ${Math.round(scale * 100)}% of its estimated time. ` +
        `Studying more hours per day would give you a more comfortable plan.`,
    );
  }

  const overflowHours = packLearning(days.slice(0, learnDays), topics, learnHours, hoursPerDay);
  if (overflowHours > EPS) {
    warnings.push(`${overflowHours} hours of topics did not fit before the exam.`);
  }
  packRevision(days.slice(learnDays), topics, hoursPerDay);

  return { days, overflowHours, warnings };
}

/**
 * Scales hours down to whole 0.5h blocks without going over capacity: round every
 * topic down first, then hand the spare blocks to the topics that lost the most.
 * Each topic keeps at least one block, so the total can only exceed capacity when
 * even that minimum does not fit.
 */
function scaleToFit(hours: number[], scale: number, capacity: number): number[] {
  const exact = hours.map((h) => h * scale);
  const result = exact.map((h) => Math.max(STEP, Math.floor(h / STEP + EPS) * STEP));
  let spare = capacity - result.reduce((sum, h) => sum + h, 0);
  const byLoss = exact
    .map((h, i) => ({ i, loss: h - result[i] }))
    .filter((x) => x.loss > EPS)
    .sort((a, b) => b.loss - a.loss);
  for (const { i } of byLoss) {
    if (spare < STEP - EPS) break;
    result[i] += STEP;
    spare -= STEP;
  }
  return result;
}

/** Fills days in syllabus order, splitting a topic across days when needed. Returns hours left over. */
function packLearning(days: StudyDay[], topics: Topic[], hours: number[], hoursPerDay: number): number {
  let dayIndex = 0;
  let freeToday = hoursPerDay;
  let overflow = 0;

  topics.forEach((topic, i) => {
    let remaining = hours[i];
    while (remaining > EPS) {
      if (dayIndex >= days.length) {
        overflow += remaining;
        return;
      }
      if (freeToday < STEP - EPS) {
        dayIndex++;
        freeToday = hoursPerDay;
        continue;
      }
      const chunk = Math.min(remaining, freeToday);
      addSession(days[dayIndex], { topicId: topic.id, hours: chunk, kind: "learn" });
      remaining -= chunk;
      freeToday -= chunk;
    }
  });

  return roundToStep(overflow);
}

/** Spreads revision over the last days, giving harder topics more time. */
function packRevision(days: StudyDay[], topics: Topic[], hoursPerDay: number): void {
  if (days.length === 0) return;
  const capacity = days.length * hoursPerDay;
  const totalDifficulty = topics.reduce((sum, t) => sum + t.difficulty, 0);
  const ordered = [...topics].sort((a, b) => b.difficulty - a.difficulty);

  let dayIndex = 0;
  let freeToday = hoursPerDay;
  for (const topic of ordered) {
    let remaining = Math.max(STEP, roundToStep((capacity * topic.difficulty) / totalDifficulty));
    while (remaining > EPS && dayIndex < days.length) {
      if (freeToday < STEP - EPS) {
        dayIndex++;
        freeToday = hoursPerDay;
        continue;
      }
      const chunk = Math.min(remaining, freeToday);
      addSession(days[dayIndex], { topicId: topic.id, hours: chunk, kind: "revise" });
      remaining -= chunk;
      freeToday -= chunk;
    }
  }
}

function addSession(day: StudyDay, session: StudySession): void {
  const last = day.sessions[day.sessions.length - 1];
  if (last && last.topicId === session.topicId && last.kind === session.kind) {
    last.hours += session.hours;
  } else {
    day.sessions.push(session);
  }
}
