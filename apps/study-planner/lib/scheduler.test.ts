import { describe, expect, it } from "vitest";
import { addDays, buildPlan, daysBetween, revisionDayCount, roundToStep } from "@/lib/scheduler";
import type { PlanInput, StudyDay, StudyPlan, StudySession, Topic } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPS = 1e-6;

function topic(id: string, hours: number, difficulty = 3): Topic {
  return { id, unit: "Unit", title: `Topic ${id}`, hours, difficulty };
}

function makeInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    topics: [topic("a", 2)],
    startDate: "2026-10-01",
    examDate: "2026-10-11",
    hoursPerDay: 2,
    ...overrides,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dayTotal = (day: StudyDay) => sum(day.sessions.map((s) => s.hours));
const allSessions = (plan: StudyPlan): StudySession[] => plan.days.flatMap((d) => d.sessions);

/** Hours of a given kind scheduled for one topic across the whole plan. */
function hoursFor(plan: StudyPlan, topicId: string, kind: "learn" | "revise"): number {
  return sum(
    allSessions(plan)
      .filter((s) => s.topicId === topicId && s.kind === kind)
      .map((s) => s.hours),
  );
}

/** Per-day capacity: no day may hold more than `hoursPerDay`. */
function expectWithinCapacity(plan: StudyPlan, hoursPerDay: number): void {
  for (const day of plan.days) {
    expect(dayTotal(day), `total hours on ${day.date}`).toBeLessThanOrEqual(hoursPerDay + EPS);
  }
}

/** Days are consecutive, start on `startDate` and stop the day before `examDate`. */
function expectCalendar(plan: StudyPlan, startDate: string, examDate: string): void {
  const expectedLength = daysBetween(startDate, examDate);
  expect(plan.days).toHaveLength(expectedLength);
  plan.days.forEach((day, i) => {
    expect(day.date).toBe(addDays(startDate, i));
    expect(day.date < examDate, `${day.date} must be before the exam`).toBe(true);
  });
  expect(plan.days.some((d) => d.date === examDate)).toBe(false);
}

/** Sessions are sane: positive hours, in multiples of nothing smaller than what we can add up, no empty ids. */
function expectSessionsWellFormed(plan: StudyPlan, knownIds: string[]): void {
  for (const s of allSessions(plan)) {
    expect(s.hours).toBeGreaterThan(0);
    expect(Number.isFinite(s.hours)).toBe(true);
    expect(knownIds).toContain(s.topicId);
    expect(["learn", "revise"]).toContain(s.kind);
  }
}

/** Learning sessions, read chronologically, never go back to an earlier topic. */
function expectSyllabusOrder(plan: StudyPlan, topics: Topic[]): void {
  const indexOf = new Map(topics.map((t, i) => [t.id, i]));
  let previous = -1;
  for (const s of allSessions(plan).filter((x) => x.kind === "learn")) {
    const idx = indexOf.get(s.topicId);
    expect(idx).toBeDefined();
    expect(idx as number).toBeGreaterThanOrEqual(previous);
    previous = idx as number;
  }
}

/** Indexes of the days that contain at least one session of `kind`. */
function dayIndexesWith(plan: StudyPlan, kind: "learn" | "revise"): number[] {
  return plan.days.flatMap((d, i) => (d.sessions.some((s) => s.kind === kind) ? [i] : []));
}

/** All the invariants that hold for every plan the scheduler produces. */
function expectCoreInvariants(plan: StudyPlan, input: PlanInput): void {
  expectCalendar(plan, input.startDate, input.examDate);
  expectWithinCapacity(plan, input.hoursPerDay);
  expectSessionsWellFormed(
    plan,
    input.topics.map((t) => t.id),
  );
  const done = new Set(input.completedIds ?? []);
  expectSyllabusOrder(
    plan,
    input.topics.filter((t) => !done.has(t.id)),
  );
  for (const s of allSessions(plan)) expect(done.has(s.topicId)).toBe(false);
  expect(plan.overflowHours).toBeGreaterThanOrEqual(0);
}

const hasWarning = (plan: StudyPlan, re: RegExp) => plan.warnings.some((w) => re.test(w));

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

describe("roundToStep", () => {
  it("rounds to the nearest half hour", () => {
    expect(roundToStep(0)).toBe(0);
    expect(roundToStep(0.2)).toBe(0);
    expect(roundToStep(0.25)).toBe(0.5);
    expect(roundToStep(0.74)).toBe(0.5);
    expect(roundToStep(0.76)).toBe(1);
    expect(roundToStep(3)).toBe(3);
    expect(roundToStep(3.3)).toBe(3.5);
  });
});

describe("addDays", () => {
  it("adds days inside a month", () => {
    expect(addDays("2026-10-01", 1)).toBe("2026-10-02");
    expect(addDays("2026-10-01", 0)).toBe("2026-10-01");
    expect(addDays("2026-10-10", 20)).toBe("2026-10-30");
  });

  it("rolls over month ends (30 and 31 day months)", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDays("2026-01-31", 31)).toBe("2026-03-03");
  });

  it("rolls over year ends in both directions", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
  });

  it("handles leap years: 2028-02-28 -> 2028-02-29", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2028-01-01", 366)).toBe("2029-01-01");
  });

  it("handles non-leap years and century rules", () => {
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    // 2100 is divisible by 100 but not 400, so it is not a leap year.
    expect(addDays("2100-02-28", 1)).toBe("2100-03-01");
    // 2000 is divisible by 400, so it is a leap year.
    expect(addDays("2000-02-28", 1)).toBe("2000-02-29");
  });

  it("supports negative offsets", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-05", -5)).toBe("2026-09-30");
  });

  it("is not affected by daylight saving transitions", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", 61)).toBe("2026-05-01");
  });
});

describe("daysBetween", () => {
  it("is 0 for the same day and positive when going forward", () => {
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(0);
    expect(daysBetween("2026-10-01", "2026-10-02")).toBe(1);
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("is negative when the second date is earlier", () => {
    expect(daysBetween("2026-10-02", "2026-10-01")).toBe(-1);
    expect(daysBetween("2027-01-01", "2026-12-31")).toBe(-1);
  });

  it("counts across month boundaries", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-02-01", "2026-03-01")).toBe(28);
  });

  it("counts across year boundaries", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("counts leap days", () => {
    expect(daysBetween("2028-02-28", "2028-02-29")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
    expect(daysBetween("2028-01-01", "2029-01-01")).toBe(366);
    expect(daysBetween("2100-02-28", "2100-03-01")).toBe(1);
  });

  it("is the inverse of addDays", () => {
    for (const start of ["2026-01-01", "2026-12-20", "2028-02-20", "2100-02-25"]) {
      for (let n = -400; n <= 800; n += 37) {
        expect(daysBetween(start, addDays(start, n))).toBe(n);
      }
    }
  });
});

describe("revisionDayCount", () => {
  it("is 0 below 3 days", () => {
    expect(revisionDayCount(-5)).toBe(0);
    expect(revisionDayCount(0)).toBe(0);
    expect(revisionDayCount(1)).toBe(0);
    expect(revisionDayCount(2)).toBe(0);
  });

  it("is at least 1 from 3 days upward", () => {
    for (const n of [3, 4, 5, 6, 7]) expect(revisionDayCount(n)).toBe(1);
  });

  it("is about 15% of the days for mid-sized totals", () => {
    expect(revisionDayCount(10)).toBe(2); // 1.5 rounds up
    expect(revisionDayCount(13)).toBe(2);
    expect(revisionDayCount(20)).toBe(3);
    expect(revisionDayCount(30)).toBe(5); // 4.5 rounds up
    expect(revisionDayCount(40)).toBe(6);
  });

  it("is capped at 7 for large totals", () => {
    expect(revisionDayCount(46)).toBe(7);
    expect(revisionDayCount(47)).toBe(7);
    expect(revisionDayCount(100)).toBe(7);
    expect(revisionDayCount(10_000)).toBe(7);
  });

  it("never decreases as the total grows and stays within 0..7", () => {
    let previous = 0;
    for (let n = 0; n <= 500; n++) {
      const r = revisionDayCount(n);
      expect(r).toBeGreaterThanOrEqual(previous);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(7);
      if (n >= 3) expect(r).toBeLessThan(n); // always leaves at least one learning day
      previous = r;
    }
  });
});

// ---------------------------------------------------------------------------
// buildPlan: normal plans
// ---------------------------------------------------------------------------

describe("buildPlan: normal plan", () => {
  // 20 days -> 3 revision days (2026-10-18..2026-10-20), 17 learning days.
  const topics = [
    topic("t1", 3, 1),
    topic("t2", 2, 5),
    topic("t3", 4, 3),
    topic("t4", 2.5, 2),
    topic("t5", 1.5, 4),
    topic("t6", 3, 3),
  ];
  const input = makeInput({ topics, startDate: "2026-10-01", examDate: "2026-10-21", hoursPerDay: 2 });
  const plan = buildPlan(input);
  const totalDays = 20;
  const revDays = revisionDayCount(totalDays);

  it("is feasible with no warnings", () => {
    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings).toEqual([]);
  });

  it("runs from the start date to the day before the exam", () => {
    expect(plan.days).toHaveLength(totalDays);
    expect(plan.days[0].date).toBe("2026-10-01");
    expect(plan.days[totalDays - 1].date).toBe("2026-10-20");
    expectCalendar(plan, input.startDate, input.examDate);
  });

  it("does not schedule anything on the exam day", () => {
    expect(plan.days.find((d) => d.date === input.examDate)).toBeUndefined();
  });

  it("satisfies the core invariants", () => {
    expectCoreInvariants(plan, input);
  });

  it("never exceeds hoursPerDay on any day", () => {
    expectWithinCapacity(plan, input.hoursPerDay);
  });

  it("schedules exactly the estimated learn hours for every topic", () => {
    for (const t of topics) {
      expect(hoursFor(plan, t.id, "learn"), t.id).toBeCloseTo(t.hours, 9);
    }
    expect(sum(topics.map((t) => hoursFor(plan, t.id, "learn")))).toBeCloseTo(sum(topics.map((t) => t.hours)), 9);
  });

  it("lists topics in syllabus order", () => {
    expectSyllabusOrder(plan, topics);
    // First-appearance order is the syllabus order too.
    const seen: string[] = [];
    for (const s of allSessions(plan)) {
      if (s.kind === "learn" && !seen.includes(s.topicId)) seen.push(s.topicId);
    }
    expect(seen).toEqual(topics.map((t) => t.id));
  });

  it("packs learning from day one without gaps", () => {
    const learnDays = dayIndexesWith(plan, "learn");
    // 16 hours at 2h/day -> the first 8 days, all full.
    expect(learnDays).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const i of learnDays) expect(dayTotal(plan.days[i])).toBeCloseTo(2, 9);
  });

  it("only revises in the final revision days, and never learns there", () => {
    const revIdx = dayIndexesWith(plan, "revise");
    expect(revIdx.length).toBeGreaterThan(0);
    for (const i of revIdx) expect(i).toBeGreaterThanOrEqual(totalDays - revDays);
    for (const i of dayIndexesWith(plan, "learn")) expect(i).toBeLessThan(totalDays - revDays);
    // The days between the last learning day and the revision block are empty.
    for (let i = 8; i < totalDays - revDays; i++) expect(plan.days[i].sessions).toEqual([]);
  });

  it("revises every topic at least once", () => {
    for (const t of topics) expect(hoursFor(plan, t.id, "revise"), t.id).toBeGreaterThanOrEqual(0.5);
  });

  it("gives harder topics at least as much revision time as easier ones", () => {
    for (const a of topics) {
      for (const b of topics) {
        if (a.difficulty > b.difficulty) {
          expect(hoursFor(plan, a.id, "revise"), `${a.id} (d${a.difficulty}) vs ${b.id} (d${b.difficulty})`).toBeGreaterThanOrEqual(
            hoursFor(plan, b.id, "revise"),
          );
        }
      }
    }
    // And the extremes differ strictly.
    expect(hoursFor(plan, "t2", "revise")).toBeGreaterThan(hoursFor(plan, "t1", "revise"));
  });

  it("uses the revision block's capacity: it is filled without exceeding hoursPerDay", () => {
    const revisionTotal = sum(topics.map((t) => hoursFor(plan, t.id, "revise")));
    expect(revisionTotal).toBeLessThanOrEqual(revDays * input.hoursPerDay + EPS);
    expect(revisionTotal).toBeGreaterThan(0);
  });

  it("does not mutate its input", () => {
    const frozen = JSON.parse(JSON.stringify(input));
    buildPlan(input);
    expect(input).toEqual(frozen);
  });

  it("is deterministic", () => {
    expect(buildPlan(input)).toEqual(plan);
  });

  it("does not share session objects between days", () => {
    const seen = new Set<StudySession>();
    for (const s of allSessions(plan)) {
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });
});

describe("buildPlan: harder-topic revision on a larger syllabus", () => {
  const topics = Array.from({ length: 12 }, (_, i) => topic(`t${i + 1}`, 2, (i % 5) + 1));
  const input = makeInput({ topics, startDate: "2026-11-01", examDate: "2026-12-31", hoursPerDay: 4 });
  const plan = buildPlan(input); // 60 days -> 7 revision days

  it("has 7 revision days at the end", () => {
    const rev = dayIndexesWith(plan, "revise");
    expect(Math.min(...rev)).toBeGreaterThanOrEqual(60 - 7);
    expect(Math.max(...rev)).toBe(59);
  });

  it("satisfies the core invariants and revision monotonicity", () => {
    expect(plan.overflowHours).toBe(0);
    expectCoreInvariants(plan, input);
    for (const a of topics) {
      for (const b of topics) {
        if (a.difficulty > b.difficulty) {
          expect(hoursFor(plan, a.id, "revise")).toBeGreaterThanOrEqual(hoursFor(plan, b.id, "revise"));
        }
      }
    }
  });
});

describe("buildPlan: a topic longer than one day", () => {
  it("is split across consecutive days", () => {
    const topics = [topic("big", 5), topic("small", 1)];
    const input = makeInput({ topics, startDate: "2026-10-01", examDate: "2026-10-11", hoursPerDay: 2 });
    const plan = buildPlan(input);

    expect(plan.days[0].sessions).toEqual([{ topicId: "big", hours: 2, kind: "learn" }]);
    expect(plan.days[1].sessions).toEqual([{ topicId: "big", hours: 2, kind: "learn" }]);
    expect(plan.days[2].sessions).toEqual([
      { topicId: "big", hours: 1, kind: "learn" },
      { topicId: "small", hours: 1, kind: "learn" },
    ]);
    expect(hoursFor(plan, "big", "learn")).toBe(5);
    expectCoreInvariants(plan, input);
  });

  it("uses consecutive days with no gaps in between", () => {
    const input = makeInput({ topics: [topic("big", 9)], hoursPerDay: 2, examDate: "2026-10-21" });
    const plan = buildPlan(input);
    const idx = plan.days.flatMap((d, i) => (d.sessions.some((s) => s.kind === "learn") ? [i] : []));
    expect(idx).toEqual([0, 1, 2, 3, 4]);
    expect(plan.days[4].sessions[0].hours).toBe(1);
  });

  it("splits across a month boundary using real dates", () => {
    const input = makeInput({
      topics: [topic("big", 6)],
      startDate: "2026-10-30",
      examDate: "2026-11-20",
      hoursPerDay: 2,
    });
    const plan = buildPlan(input);
    expect(plan.days.slice(0, 3).map((d) => d.date)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(dayIndexesWith(plan, "learn")).toEqual([0, 1, 2]);
  });

  it("merges adjacent same-topic same-kind sessions within a day", () => {
    const plan = buildPlan(makeInput({ topics: [topic("a", 1.5), topic("b", 2)], hoursPerDay: 3 }));
    for (const day of plan.days) {
      for (let i = 1; i < day.sessions.length; i++) {
        const prev = day.sessions[i - 1];
        const cur = day.sessions[i];
        expect(prev.topicId === cur.topicId && prev.kind === cur.kind).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildPlan: completed topics
// ---------------------------------------------------------------------------

describe("buildPlan: completedIds", () => {
  const topics = [topic("a", 2, 2), topic("b", 3, 4), topic("c", 2, 3), topic("d", 1, 5)];
  const input = makeInput({
    topics,
    startDate: "2026-10-01",
    examDate: "2026-10-21",
    hoursPerDay: 2,
    completedIds: ["b", "d"],
  });
  const plan = buildPlan(input);

  it("excludes completed topics from learning and revision", () => {
    const ids = new Set(allSessions(plan).map((s) => s.topicId));
    expect(ids.has("b")).toBe(false);
    expect(ids.has("d")).toBe(false);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("c")).toBe(true);
  });

  it("still schedules the remaining topics fully and in order", () => {
    expect(hoursFor(plan, "a", "learn")).toBe(2);
    expect(hoursFor(plan, "c", "learn")).toBe(2);
    expectCoreInvariants(plan, input);
    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings).toEqual([]);
  });

  it("revises the remaining topics only, and uses their difficulties for the split", () => {
    expect(hoursFor(plan, "a", "revise")).toBeGreaterThan(0);
    expect(hoursFor(plan, "c", "revise")).toBeGreaterThanOrEqual(hoursFor(plan, "a", "revise"));
    // 3 revision days x 2h = 6h shared 2:3 between a (d2) and c (d3).
    expect(hoursFor(plan, "a", "revise")).toBe(2.5);
    expect(hoursFor(plan, "c", "revise")).toBe(3.5);
  });

  it("lets completed topics free up capacity so a tight plan becomes comfortable", () => {
    const base = makeInput({
      topics: [topic("a", 10), topic("b", 10)],
      startDate: "2026-10-01",
      examDate: "2026-10-11", // 10 days, 2h -> 16h learn capacity with 2 revision days
      hoursPerDay: 2,
    });
    const tight = buildPlan(base);
    expect(tight.warnings.length).toBeGreaterThan(0);
    const relaxed = buildPlan({ ...base, completedIds: ["b"] });
    expect(relaxed.warnings).toEqual([]);
    expect(relaxed.overflowHours).toBe(0);
  });

  it("ignores ids that are not in the syllabus", () => {
    const withGhost = buildPlan({ ...input, completedIds: ["b", "d", "does-not-exist"] });
    expect(withGhost).toEqual(plan);
  });

  it("treats an empty completedIds like undefined", () => {
    const a = buildPlan({ ...input, completedIds: [] });
    const b = buildPlan({ ...input, completedIds: undefined });
    expect(a).toEqual(b);
    expect(hoursFor(a, "b", "learn")).toBe(3);
  });

  it("with every topic completed yields empty days, no overflow, no warnings", () => {
    const all = buildPlan({ ...input, completedIds: topics.map((t) => t.id) });
    expect(all.days).toHaveLength(20);
    expect(all.days.every((d) => d.sessions.length === 0)).toBe(true);
    expect(all.overflowHours).toBe(0);
    expect(all.warnings).toEqual([]);
  });

  it("does not count completed topics as overflow when the exam date is invalid", () => {
    const plan2 = buildPlan({
      topics: [topic("a", 4), topic("b", 6)],
      startDate: "2026-10-10",
      examDate: "2026-10-10",
      hoursPerDay: 2,
      completedIds: ["b"],
    });
    expect(plan2.overflowHours).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// buildPlan: tight schedules
// ---------------------------------------------------------------------------

describe("buildPlan: tight schedule", () => {
  // 10 days -> normally 2 revision days (learn capacity 16h at 2h/day).
  const base = { startDate: "2026-10-01", examDate: "2026-10-11", hoursPerDay: 2 };

  it("keeps two revision days when everything fits (16h needed)", () => {
    const input = makeInput({ ...base, topics: Array.from({ length: 8 }, (_, i) => topic(`t${i}`, 2)) });
    const plan = buildPlan(input);
    expect(plan.warnings).toEqual([]);
    expect(plan.overflowHours).toBe(0);
    expect(dayIndexesWith(plan, "revise")).toEqual([8, 9]);
    expectCoreInvariants(plan, input);
  });

  it("shrinks revision to one day with a warning when that makes it fit (18h needed)", () => {
    const input = makeInput({ ...base, topics: Array.from({ length: 9 }, (_, i) => topic(`t${i}`, 2)) });
    const plan = buildPlan(input);

    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings).toHaveLength(1);
    expect(hasWarning(plan, /only the last day is kept for revision/i)).toBe(true);
    // Learning takes days 0..8 fully, revision only day 9.
    expect(dayIndexesWith(plan, "learn")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(dayIndexesWith(plan, "revise")).toEqual([9]);
    for (const t of input.topics) expect(hoursFor(plan, t.id, "learn")).toBe(2); // no scaling
    expectCoreInvariants(plan, input);
  });

  it("scales hours down with a warning when one revision day is still not enough", () => {
    // 4 topics x 5h = 20h, learn capacity with one revision day = 9 x 2 = 18h.
    const input = makeInput({ ...base, topics: Array.from({ length: 4 }, (_, i) => topic(`t${i}`, 5)) });
    const plan = buildPlan(input);

    expect(hasWarning(plan, /only the last day is kept for revision/i)).toBe(true);
    expect(hasWarning(plan, /90%/)).toBe(true);
    expect(hasWarning(plan, /needs about 20 hours but only 18 are available/)).toBe(true);
    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings.some((w) => /did not fit/.test(w))).toBe(false);
    for (const t of input.topics) expect(hoursFor(plan, t.id, "learn")).toBe(4.5);
    expect(dayIndexesWith(plan, "revise")).toEqual([9]);
    expectCoreInvariants(plan, input);
  });

  it("scales without the 'only the last day' warning when only one revision day existed anyway", () => {
    // 4 days -> 1 revision day, 3 x 2h = 6h capacity; 10h needed.
    const input = makeInput({
      startDate: "2026-10-01",
      examDate: "2026-10-05",
      hoursPerDay: 2,
      topics: [topic("a", 5), topic("b", 5)],
    });
    const plan = buildPlan(input);
    expect(plan.warnings).toHaveLength(1);
    expect(hasWarning(plan, /60%/)).toBe(true);
    expect(hasWarning(plan, /only the last day/)).toBe(false);
    expect(plan.overflowHours).toBe(0);
    expect(hoursFor(plan, "a", "learn")).toBe(3);
    expect(hoursFor(plan, "b", "learn")).toBe(3);
    expectCoreInvariants(plan, input);
  });

  it("scales every topic by the same ratio, preserving relative sizes", () => {
    // 3 days -> 1 revision day, 2 x 2h = 4h capacity; topics 8h + 4h = 12h -> scale 1/3.
    const input = makeInput({
      startDate: "2026-10-01",
      examDate: "2026-10-04",
      hoursPerDay: 2,
      topics: [topic("big", 8), topic("small", 4)],
    });
    const plan = buildPlan(input);
    expect(plan.overflowHours).toBe(0);
    expect(hoursFor(plan, "big", "learn")).toBeCloseTo(2.5, 9); // 2.667 -> 2.5
    expect(hoursFor(plan, "small", "learn")).toBe(1.5); // 1.333 -> 1.5
    expect(hoursFor(plan, "big", "learn")).toBeGreaterThan(hoursFor(plan, "small", "learn"));
    expectCoreInvariants(plan, input);
  });

  it("fits when each topic can shrink to exactly 0.5h", () => {
    // 2 days, 1h/day: no revision days; capacity 2h; 4 topics at the 0.5h floor = 2h.
    const input = makeInput({
      startDate: "2026-10-01",
      examDate: "2026-10-03",
      hoursPerDay: 1,
      topics: Array.from({ length: 4 }, (_, i) => topic(`t${i}`, 10)),
    });
    const plan = buildPlan(input);
    expect(plan.overflowHours).toBe(0);
    expect(hasWarning(plan, /about 5% of its estimated time/)).toBe(true);
    for (const t of input.topics) expect(hoursFor(plan, t.id, "learn")).toBe(0.5);
    expect(plan.days.every((d) => dayTotal(d) === 1)).toBe(true);
    expectCoreInvariants(plan, input);
  });

  it("has no revision at all on plans shorter than 3 days", () => {
    const one = buildPlan(makeInput({ examDate: "2026-10-02", topics: [topic("a", 1)], hoursPerDay: 2 }));
    const two = buildPlan(makeInput({ examDate: "2026-10-03", topics: [topic("a", 1)], hoursPerDay: 2 }));
    expect(one.days).toHaveLength(1);
    expect(two.days).toHaveLength(2);
    expect(allSessions(one).every((s) => s.kind === "learn")).toBe(true);
    expect(allSessions(two).every((s) => s.kind === "learn")).toBe(true);
  });

  it("exactly-full learning capacity does not trigger warnings (floating point tolerance)", () => {
    // 10 topics of 0.1h * ... use 1.5h hoursPerDay and 0.5h-multiples that sum to capacity exactly.
    const input = makeInput({
      startDate: "2026-10-01",
      examDate: "2026-10-11",
      hoursPerDay: 1.5,
      topics: Array.from({ length: 8 }, (_, i) => topic(`t${i}`, 1.5)), // 12h == 8 learn days x 1.5
    });
    const plan = buildPlan(input);
    expect(plan.warnings).toEqual([]);
    expect(plan.overflowHours).toBe(0);
  });
});

describe("buildPlan: tight schedule, rounding after scaling", () => {
  // Regression: scaled hours used to be rounded to the nearest 0.5h, which can round *up*.
  // Here the scale is 18/20 = 0.9, so each 2h topic became 1.8h -> 2.0h and 2h overflowed
  // although 15h would fit in the 18h available.
  const input = makeInput({
    startDate: "2026-10-01",
    examDate: "2026-10-11",
    hoursPerDay: 2,
    topics: Array.from({ length: 10 }, (_, i) => topic(`t${i}`, 2)),
  });

  it("does not overflow when 0.5h per topic would still fit (rounding must not defeat scaling)", () => {
    const plan = buildPlan(input);
    expect(plan.overflowHours).toBe(0);
  });

  it("at least reports the overflow honestly instead of hiding it", () => {
    const plan = buildPlan(input);
    // Whatever the algorithm does, hours placed + overflow must be consistent and capacity respected.
    expectWithinCapacity(plan, 2);
    const placed = sum(input.topics.map((t) => hoursFor(plan, t.id, "learn")));
    expect(placed).toBeLessThanOrEqual(18 + EPS);
    if (plan.overflowHours > 0) expect(hasWarning(plan, /did not fit/)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPlan: impossible schedules
// ---------------------------------------------------------------------------

describe("buildPlan: impossible schedule", () => {
  it("40 topics, 1 day, 1 hour/day reports overflow and a warning", () => {
    const input = makeInput({
      startDate: "2026-10-01",
      examDate: "2026-10-02",
      hoursPerDay: 1,
      topics: Array.from({ length: 40 }, (_, i) => topic(`t${i}`, 1)),
    });
    const plan = buildPlan(input);

    expect(plan.days).toHaveLength(1);
    expect(plan.overflowHours).toBeGreaterThan(0);
    expect(hasWarning(plan, /did not fit before the exam/)).toBe(true);
    // Every topic gets the 0.5h floor (20h); one hour fits, 19h overflow.
    expect(plan.overflowHours).toBe(19);
    expect(dayTotal(plan.days[0])).toBe(1);
    expectCoreInvariants(plan, input);
  });

  it("the overflow warning states the overflow amount", () => {
    const plan = buildPlan(
      makeInput({
        startDate: "2026-10-01",
        examDate: "2026-10-02",
        hoursPerDay: 1,
        topics: Array.from({ length: 4 }, (_, i) => topic(`t${i}`, 1)),
      }),
    );
    // 4 x 0.5h floor = 2h vs 1h capacity.
    expect(plan.overflowHours).toBe(1);
    expect(hasWarning(plan, /1 hours of topics did not fit/)).toBe(true);
  });

  it("emits both the scaling and the overflow warning when even the floor cannot fit", () => {
    const plan = buildPlan(
      makeInput({
        startDate: "2026-10-01",
        examDate: "2026-10-03",
        hoursPerDay: 1,
        topics: Array.from({ length: 10 }, (_, i) => topic(`t${i}`, 3)),
      }),
    );
    expect(hasWarning(plan, /each topic gets about/)).toBe(true);
    expect(hasWarning(plan, /did not fit before the exam/)).toBe(true);
    expect(plan.overflowHours).toBe(3); // 10 x 0.5 = 5h floor vs 2h capacity
  });

  it("overflows topics from the end of the syllabus, keeping early topics", () => {
    const topics = Array.from({ length: 6 }, (_, i) => topic(`t${i}`, 1));
    const plan = buildPlan(
      makeInput({ startDate: "2026-10-01", examDate: "2026-10-02", hoursPerDay: 1, topics }),
    );
    expect(hoursFor(plan, "t0", "learn")).toBeGreaterThan(0);
    expect(hoursFor(plan, "t5", "learn")).toBe(0);
  });

  it("a very small hoursPerDay (below the 0.5h step) schedules nothing and reports it", () => {
    const plan = buildPlan(
      makeInput({ hoursPerDay: 0.25, topics: [topic("a", 1)], examDate: "2026-10-04" }),
    );
    expect(allSessions(plan)).toHaveLength(0);
    expect(hasWarning(plan, /hours per day must be at least 0\.5/i)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPlan: invalid input
// ---------------------------------------------------------------------------

describe("buildPlan: invalid input", () => {
  const topics = [topic("a", 2), topic("b", 3)];

  it("exam date equal to the start date -> warning and no days", () => {
    const plan = buildPlan(makeInput({ topics, startDate: "2026-10-10", examDate: "2026-10-10" }));
    expect(plan.days).toEqual([]);
    expect(hasWarning(plan, /exam date must be after the start date/i)).toBe(true);
    expect(plan.overflowHours).toBe(5);
  });

  it("exam date before the start date -> warning and no days", () => {
    const plan = buildPlan(makeInput({ topics, startDate: "2026-10-10", examDate: "2026-10-01" }));
    expect(plan.days).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
    expect(hasWarning(plan, /exam date must be after the start date/i)).toBe(true);
    expect(plan.overflowHours).toBe(5);
  });

  it("exam date before the start date across a year boundary", () => {
    const plan = buildPlan(makeInput({ topics, startDate: "2027-01-01", examDate: "2026-12-31" }));
    expect(plan.days).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
  });

  it("hoursPerDay 0 -> warning and no days", () => {
    const plan = buildPlan(makeInput({ topics, hoursPerDay: 0 }));
    expect(plan.days).toEqual([]);
    expect(hasWarning(plan, /hours per day must be at least 0\.5/i)).toBe(true);
    expect(plan.overflowHours).toBe(0);
  });

  it("negative hoursPerDay -> warning and no days", () => {
    const plan = buildPlan(makeInput({ topics, hoursPerDay: -3 }));
    expect(plan.days).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
  });

  it("NaN hoursPerDay -> warning and no days", () => {
    const plan = buildPlan(makeInput({ topics, hoursPerDay: Number.NaN }));
    expect(plan.days).toEqual([]);
    expect(hasWarning(plan, /hours per day/i)).toBe(true);
  });

  it("both problems at once reports the hours-per-day problem first", () => {
    const plan = buildPlan(makeInput({ topics, hoursPerDay: 0, startDate: "2026-10-10", examDate: "2026-10-01" }));
    expect(plan.days).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
    expect(hasWarning(plan, /hours per day/i)).toBe(true);
  });

  it("returns a fresh warnings array each call", () => {
    const a = buildPlan(makeInput({ topics, hoursPerDay: 0 }));
    const b = buildPlan(makeInput({ topics, hoursPerDay: 0 }));
    expect(a.warnings).not.toBe(b.warnings);
  });

  // Regression: daysBetween returns NaN for a bad date and `NaN <= 0` is false, so the date
  // guard used to be skipped.
  it("an unparseable date is reported as a date problem", () => {
    const plan = buildPlan(makeInput({ topics, startDate: "not-a-date", examDate: "2026-10-10" }));
    expect(plan.days).toEqual([]);
    expect(hasWarning(plan, /date/i)).toBe(true);
    expect(hasWarning(plan, /did not fit/i)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildPlan: empty topics
// ---------------------------------------------------------------------------

describe("buildPlan: empty topic list", () => {
  it("returns empty days for the whole period with no overflow and no warnings", () => {
    const input = makeInput({ topics: [], startDate: "2026-10-01", examDate: "2026-10-08" });
    const plan = buildPlan(input);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.every((d) => d.sessions.length === 0)).toBe(true);
    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings).toEqual([]);
    expectCalendar(plan, input.startDate, input.examDate);
  });

  it("with an invalid exam date still warns", () => {
    const plan = buildPlan(makeInput({ topics: [], startDate: "2026-10-08", examDate: "2026-10-01" }));
    expect(plan.days).toEqual([]);
    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings).toHaveLength(1);
  });

  it("with hoursPerDay 0 still warns", () => {
    const plan = buildPlan(makeInput({ topics: [], hoursPerDay: 0 }));
    expect(plan.days).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildPlan: non-integer hoursPerDay
// ---------------------------------------------------------------------------

describe("buildPlan: non-integer hoursPerDay", () => {
  it("packs 1.5h days exactly", () => {
    const input = makeInput({
      topics: [topic("a", 3), topic("b", 3), topic("c", 1.5)],
      startDate: "2026-10-01",
      examDate: "2026-10-21",
      hoursPerDay: 1.5,
    });
    const plan = buildPlan(input);

    expect(plan.overflowHours).toBe(0);
    expect(plan.warnings).toEqual([]);
    expect(plan.days[0].sessions).toEqual([{ topicId: "a", hours: 1.5, kind: "learn" }]);
    expect(plan.days[1].sessions).toEqual([{ topicId: "a", hours: 1.5, kind: "learn" }]);
    expect(plan.days[2].sessions).toEqual([{ topicId: "b", hours: 1.5, kind: "learn" }]);
    expect(plan.days[3].sessions).toEqual([{ topicId: "b", hours: 1.5, kind: "learn" }]);
    expect(plan.days[4].sessions).toEqual([{ topicId: "c", hours: 1.5, kind: "learn" }]);
    for (const t of input.topics) expect(hoursFor(plan, t.id, "learn")).toBeCloseTo(t.hours, 9);
    expectCoreInvariants(plan, input);
  });

  it("splits topics across 1.5h days and never exceeds 1.5h", () => {
    const input = makeInput({
      topics: [topic("a", 2), topic("b", 2), topic("c", 2)],
      startDate: "2026-10-01",
      examDate: "2026-10-21",
      hoursPerDay: 1.5,
    });
    const plan = buildPlan(input);
    expect(plan.days[0].sessions).toEqual([
      { topicId: "a", hours: 1.5, kind: "learn" },
    ]);
    expect(plan.days[1].sessions).toEqual([
      { topicId: "a", hours: 0.5, kind: "learn" },
      { topicId: "b", hours: 1, kind: "learn" },
    ]);
    expect(plan.overflowHours).toBe(0);
    for (const t of input.topics) expect(hoursFor(plan, t.id, "learn")).toBe(2);
    expectCoreInvariants(plan, input);
  });

  it("keeps revision within 1.5h per day too", () => {
    const input = makeInput({
      topics: [topic("a", 2, 5), topic("b", 2, 1), topic("c", 2, 3)],
      startDate: "2026-10-01",
      examDate: "2026-10-31",
      hoursPerDay: 1.5,
    });
    const plan = buildPlan(input);
    expect(dayIndexesWith(plan, "revise").length).toBeGreaterThan(0);
    expectCoreInvariants(plan, input);
    expect(hoursFor(plan, "a", "revise")).toBeGreaterThanOrEqual(hoursFor(plan, "c", "revise"));
    expect(hoursFor(plan, "c", "revise")).toBeGreaterThanOrEqual(hoursFor(plan, "b", "revise"));
  });

  it("works with 2.5h/day and fractional topic hours", () => {
    const input = makeInput({
      topics: [topic("a", 1.25), topic("b", 3.75), topic("c", 0.5)],
      startDate: "2026-10-01",
      examDate: "2026-10-15",
      hoursPerDay: 2.5,
    });
    const plan = buildPlan(input);
    expect(plan.overflowHours).toBe(0);
    expect(hoursFor(plan, "a", "learn")).toBeCloseTo(1.25, 9);
    expect(hoursFor(plan, "b", "learn")).toBeCloseTo(3.75, 9);
    expect(hoursFor(plan, "c", "learn")).toBeCloseTo(0.5, 9);
    expectCoreInvariants(plan, input);
  });

  it("a scaled-down plan on 1.5h days fits exactly when the scaled hours are multiples of 0.5", () => {
    // 6 days -> 1 revision day, 5 x 1.5 = 7.5h capacity, 15h needed -> scale 0.5.
    const input = makeInput({
      topics: [topic("a", 3), topic("b", 12)],
      startDate: "2026-10-01",
      examDate: "2026-10-07",
      hoursPerDay: 1.5,
    });
    const plan = buildPlan(input);
    expect(hasWarning(plan, /50%/)).toBe(true);
    expect(plan.overflowHours).toBe(0);
    expect(hoursFor(plan, "a", "learn")).toBe(1.5);
    expect(hoursFor(plan, "b", "learn")).toBe(6);
    expectCoreInvariants(plan, input);
  });

  // Regression, same rounding problem: scale 0.75 turned 5h into 3.75h, rounded up to 4h,
  // so 2 x 4h = 8h > 7.5h capacity although 3.5h each would fit.
  it("a scaled-down plan on 1.5h days does not overflow when rounding is the only problem", () => {
    const input = makeInput({
      topics: [topic("a", 5), topic("b", 5)],
      startDate: "2026-10-01",
      examDate: "2026-10-07",
      hoursPerDay: 1.5,
    });
    const plan = buildPlan(input);
    expect(hasWarning(plan, /75%/)).toBe(true);
    expect(plan.overflowHours).toBe(0);
  });

  it("a scaled-down plan on 1.5h days never exceeds the per-day capacity", () => {
    const input = makeInput({
      topics: [topic("a", 5), topic("b", 5)],
      startDate: "2026-10-01",
      examDate: "2026-10-07",
      hoursPerDay: 1.5,
    });
    expectCoreInvariants(buildPlan(input), input);
  });
});

describe("buildPlan: hoursPerDay that is not a multiple of the 0.5h step", () => {
  // Time is packed in 0.5h blocks, so 1.25h per day gives 1h of usable time. Here that is
  // 5 learn days x 1h = 5h for six 1h topics: the plan must compress with a warning up front
  // instead of claiming 6.25h of capacity and then overflowing.
  it("uses only whole 0.5h blocks for capacity, so it compresses instead of overflowing", () => {
    const input = makeInput({
      topics: Array.from({ length: 6 }, (_, i) => topic(`t${i}`, 1)),
      startDate: "2026-10-01",
      examDate: "2026-10-07",
      hoursPerDay: 1.25,
    });
    const plan = buildPlan(input);
    expect(plan.overflowHours).toBe(0);
    expect(hasWarning(plan, /only 5 are available/i)).toBe(true);
    const learned = input.topics.reduce((sum, t) => sum + hoursFor(plan, t.id, "learn"), 0);
    expect(learned).toBe(5);
  });

  it("never exceeds the per-day capacity regardless", () => {
    const input = makeInput({
      topics: Array.from({ length: 6 }, (_, i) => topic(`t${i}`, 1)),
      startDate: "2026-10-01",
      examDate: "2026-10-07",
      hoursPerDay: 1.25,
    });
    expectCoreInvariants(buildPlan(input), input);
  });
});

// ---------------------------------------------------------------------------
// buildPlan: randomized invariants (seeded, deterministic)
// ---------------------------------------------------------------------------

describe("buildPlan: randomized invariants", () => {
  // Small deterministic PRNG (mulberry32) so failures are reproducible.
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("holds the core invariants for 500 random inputs", () => {
    const rand = rng(20261001);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    const hoursChoices = [0.5, 1, 1.5, 2, 3, 4.5, 6];

    for (let n = 0; n < 500; n++) {
      const count = int(0, 25);
      const topics = Array.from({ length: count }, (_, i) => topic(`t${i}`, int(1, 12) / 2, int(1, 5)));
      const completedIds = topics.filter(() => rand() < 0.2).map((t) => t.id);
      const startDate = addDays("2026-12-01", int(0, 400));
      const input: PlanInput = {
        topics,
        startDate,
        examDate: addDays(startDate, int(1, 60)),
        hoursPerDay: hoursChoices[int(0, hoursChoices.length - 1)],
        completedIds,
      };
      const plan = buildPlan(input);

      expectCoreInvariants(plan, input);

      const remaining = topics.filter((t) => !completedIds.includes(t.id));
      const scaled = hasWarning(plan, /each topic gets about/);
      const totalDays = daysBetween(input.startDate, input.examDate);
      const revIdx = dayIndexesWith(plan, "revise");
      const learnIdx = dayIndexesWith(plan, "learn");

      // Revision never happens on a learning day and only in a tail block of the plan.
      if (revIdx.length > 0 && learnIdx.length > 0) {
        expect(Math.min(...revIdx)).toBeGreaterThan(Math.max(...learnIdx));
      }
      expect(totalDays - (revIdx.length ? Math.min(...revIdx) : totalDays)).toBeLessThanOrEqual(7);

      for (const t of remaining) {
        const learn = hoursFor(plan, t.id, "learn");
        if (!scaled && plan.overflowHours === 0) {
          expect(learn, `${t.id} learn hours`).toBeCloseTo(t.hours, 9);
        }
        expect(learn).toBeLessThanOrEqual(Math.max(t.hours, 0.5) + EPS);
      }

      // Hours placed + overflow account for everything that was planned to be learned.
      if (!scaled) {
        const placed = sum(remaining.map((t) => hoursFor(plan, t.id, "learn")));
        expect(placed + plan.overflowHours).toBeCloseTo(sum(remaining.map((t) => t.hours)), 9);
      }
    }
  });
});
