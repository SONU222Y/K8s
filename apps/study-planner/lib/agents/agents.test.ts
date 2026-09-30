import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateOffline, parseOffline } from "./offline";
import { applyEstimates, applyVerification, runPipeline } from "./pipeline";
import { appearsIn } from "./text";

const SYLLABUS = `Biology 101 — Grading: midterm 30%, final 50%

Unit 1: Introduction to Cells
- Cell theory
- Prokaryotic and eukaryotic cells
- Cell membrane structure

Unit 2: Energy, Photosynthesis; Cellular respiration

Module 3 – Genetics
1. Mendelian inheritance
2. DNA replication
3. Partial dominance
`;

describe("parseOffline", () => {
  it("groups bullets and numbered lines under unit headings", () => {
    const { units } = parseOffline(SYLLABUS);
    const unit1 = units.find((u) => u.name === "Unit 1: Introduction to Cells");
    expect(unit1?.topics).toEqual(["Cell theory", "Prokaryotic and eukaryotic cells", "Cell membrane structure"]);
    const genetics = units.find((u) => u.name === "Module 3 – Genetics");
    expect(genetics?.topics).toEqual(["Mendelian inheritance", "DNA replication", "Partial dominance"]);
  });

  it("splits an inline list after a unit name", () => {
    const unit2 = parseOffline(SYLLABUS).units.find((u) => u.name === "Unit 2");
    expect(unit2?.topics).toEqual(["Energy", "Photosynthesis", "Cellular respiration"]);
  });

  it("does not treat words that start with a keyword as headings", () => {
    const { units } = parseOffline("Calculus\n- Partial derivatives\nPartial fractions");
    expect(units).toHaveLength(1);
    expect(units[0].topics).toContain("Partial fractions");
  });

  it("uses a General unit when there are no headings", () => {
    const { units } = parseOffline("- Algebra\n- Geometry");
    expect(units).toEqual([{ name: "General", topics: ["Algebra", "Geometry"] }]);
  });
});

describe("estimateOffline", () => {
  it("rates hard topics above introductory ones", () => {
    expect(estimateOffline("Advanced integration techniques").difficulty).toBeGreaterThan(
      estimateOffline("Introduction to algebra").difficulty,
    );
  });

  it("keeps values in range", () => {
    const { difficulty, hours } = estimateOffline("x");
    expect(difficulty).toBeGreaterThanOrEqual(1);
    expect(difficulty).toBeLessThanOrEqual(5);
    expect(hours).toBeGreaterThanOrEqual(1);
  });
});

describe("appearsIn", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(appearsIn("Unit 2: Energy,  Photosynthesis;", "energy photosynthesis")).toBe(true);
    expect(appearsIn("Unit 2", "")).toBe(false);
    expect(appearsIn("Cell theory", "Quantum tunnelling")).toBe(false);
  });
});

const drafts = [
  { id: "t1", unit: "Unit 1", title: "Cell theory" },
  { id: "t2", unit: "Unit 1", title: "Cell membrane structure" },
  { id: "t3", unit: "Unit 3", title: "Mendelian inheritance" },
  { id: "t4", unit: "Unit 3", title: "Grading policy" },
];

describe("applyVerification", () => {
  it("adds a missed topic only when its evidence is really in the syllabus", () => {
    const { drafts: result, step } = applyVerification(SYLLABUS, drafts, {
      missing: [
        { unit: "Unit 1", title: "Prokaryotic and eukaryotic cells", evidence: "Prokaryotic and eukaryotic cells" },
        { unit: "Unit 3", title: "CRISPR", evidence: "CRISPR gene editing" },
      ],
      invalid: [],
    });
    const titles = result.map((d) => d.title);
    expect(titles).toContain("Prokaryotic and eukaryotic cells");
    expect(titles).not.toContain("CRISPR");
    // Inserted at the end of its own unit, not the end of the list.
    expect(titles.indexOf("Prokaryotic and eukaryotic cells")).toBe(2);
    expect(step.details?.join(" ")).toMatch(/Rejected 1/);
  });

  it("removes items the verifier marks as not study material", () => {
    const { drafts: result, step } = applyVerification(SYLLABUS, drafts, {
      missing: [],
      invalid: [{ title: "grading policy", reason: "Not a study topic." }],
    });
    expect(result.map((d) => d.id)).toEqual(["t1", "t2", "t3"]);
    expect(step.summary).toMatch(/removed 1/);
  });

  it("refuses to remove more than half of the topics", () => {
    const { drafts: result } = applyVerification(SYLLABUS, drafts, {
      missing: [],
      invalid: drafts.slice(0, 3).map((d) => ({ title: d.title, reason: "?" })),
    });
    expect(result).toHaveLength(drafts.length);
  });

  it("does not add a duplicate of an existing topic", () => {
    const { drafts: result } = applyVerification(SYLLABUS, drafts, {
      missing: [{ unit: "Unit 1", title: "cell theory", evidence: "Cell theory" }],
      invalid: [],
    });
    expect(result).toHaveLength(drafts.length);
  });

  it("reports a failed verifier without changing the list", () => {
    const { drafts: result, step } = applyVerification(SYLLABUS, drafts, new Error("timeout"));
    expect(result).toBe(drafts);
    expect(step.details).toEqual(["timeout"]);
  });
});

describe("applyEstimates", () => {
  it("clamps Claude's numbers and falls back for missing ids", () => {
    const { topics, step } = applyEstimates(drafts.slice(0, 2), [
      { estimates: [{ id: "t1", difficulty: 9, hours: 0.2, reason: "" }] },
    ]);
    expect(topics[0]).toMatchObject({ difficulty: 5, hours: 0.5 });
    expect(topics[1].difficulty).toBeGreaterThanOrEqual(1);
    expect(step.mode).toBe("claude");
    expect(step.details?.[0]).toMatch(/1 topic\(s\) had no estimate/);
  });
});

describe("runPipeline without an API key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("produces topics with the offline agents", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const { topics, steps } = await runPipeline(SYLLABUS);
    expect(topics.length).toBeGreaterThanOrEqual(9);
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
    expect(steps.map((s) => s.agent)).toEqual(["parser", "verifier", "estimator"]);
    expect(steps.every((s) => s.mode === "offline")).toBe(true);
  });
});
