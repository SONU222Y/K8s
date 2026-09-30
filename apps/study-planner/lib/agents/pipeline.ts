import type { PipelineStep, Topic } from "../types";
import { claudeAvailable } from "./claude";
import { estimateWithClaude, type Estimates } from "./estimator";
import { estimateOffline, parseOffline } from "./offline";
import { parseWithClaude, type ParsedSyllabus } from "./parser";
import { appearsIn, clamp, normalize, roundHalf } from "./text";
import { verifyWithClaude, type Verification } from "./verifier";

// How the agents work together:
//
//   parser ──► verifier ──┐  (verifier and estimator run in parallel)
//          └─► estimator ─┴─► apply corrections ─► estimate any added topics ─► topics
//
// Every Claude step falls back to the offline rules if it fails, so the user always gets a plan.

interface Draft {
  id: string;
  unit: string;
  title: string;
}

export interface PipelineResult {
  topics: Topic[];
  steps: PipelineStep[];
}

export async function runPipeline(syllabus: string): Promise<PipelineResult> {
  const useClaude = claudeAvailable();
  const steps: PipelineStep[] = [];

  // 1. Parser agent
  let parsed: ParsedSyllabus;
  let parserMode: PipelineStep["mode"] = "offline";
  let parserNote: string | undefined;
  if (useClaude) {
    try {
      parsed = await parseWithClaude(syllabus);
      parserMode = "claude";
    } catch (error) {
      parsed = parseOffline(syllabus);
      parserNote = `Claude was unavailable (${errorMessage(error)}), so simple text rules were used.`;
    }
  } else {
    parsed = parseOffline(syllabus);
  }

  let drafts = toDrafts(parsed);
  if (parserMode === "claude" && drafts.length === 0) {
    // An empty answer is never useful; the text rules may still find something.
    drafts = toDrafts(parseOffline(syllabus));
    parserNote = "Claude found no topics, so simple text rules were used instead.";
    parserMode = "offline";
  }
  steps.push({
    agent: "parser",
    mode: parserMode,
    summary: `Found ${drafts.length} topics in ${countUnits(drafts)} units.`,
    details: parserNote ? [parserNote] : undefined,
  });
  if (drafts.length === 0) return { topics: [], steps };

  // 2 + 3. Verifier and estimator agents, in parallel.
  const [verification, estimates] = await Promise.all([
    parserMode === "claude" ? settle(verifyWithClaude(syllabus, drafts)) : Promise.resolve(null),
    parserMode === "claude" ? settle(estimateWithClaude(syllabus, drafts)) : Promise.resolve(null),
  ]);

  const verified = applyVerification(syllabus, drafts, verification);
  steps.push(verified.step);

  // Topics the verifier added were not in the estimator's input, so estimate them now.
  const added = verified.drafts.filter((d) => !drafts.includes(d));
  let addedEstimates: Estimates | Error | null = null;
  if (added.length > 0 && estimates && !(estimates instanceof Error)) {
    addedEstimates = await settle(estimateWithClaude(syllabus, added));
  }

  const { topics, step } = applyEstimates(verified.drafts, [estimates, addedEstimates]);
  steps.push(step);
  return { topics, steps };
}

function toDrafts(parsed: ParsedSyllabus): Draft[] {
  const drafts: Draft[] = [];
  const seen = new Set<string>();
  for (const unit of parsed.units) {
    const unitName = unit.name.trim() || "General";
    for (const rawTitle of unit.topics) {
      const title = rawTitle.trim();
      const key = normalize(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      drafts.push({ id: `t${drafts.length + 1}`, unit: unitName, title });
    }
  }
  return drafts;
}

export function applyVerification(
  syllabus: string,
  drafts: Draft[],
  verification: Verification | Error | null,
): { drafts: Draft[]; step: PipelineStep } {
  if (verification === null) {
    return {
      drafts,
      step: { agent: "verifier", mode: "offline", summary: "Skipped: the verifier needs the Claude API." },
    };
  }
  if (verification instanceof Error) {
    return {
      drafts,
      step: {
        agent: "verifier",
        mode: "claude",
        summary: "Could not check the topic list this time.",
        details: [errorMessage(verification)],
      },
    };
  }

  const details: string[] = [];
  const result = [...drafts];
  const existing = new Set(drafts.map((d) => normalize(d.title)));

  // Removals: guard against an over-eager verifier deleting most of the syllabus.
  const toRemove = new Set<string>();
  for (const item of verification.invalid) {
    const key = normalize(item.title);
    if (existing.has(key)) toRemove.add(key);
  }
  if (toRemove.size > drafts.length / 2) {
    details.push(`Ignored a suggestion to remove ${toRemove.size} of ${drafts.length} topics, because that is too many to be right.`);
    toRemove.clear();
  }
  for (const item of verification.invalid) {
    const key = normalize(item.title);
    if (!toRemove.has(key)) continue;
    const index = result.findIndex((d) => normalize(d.title) === key);
    if (index >= 0) {
      result.splice(index, 1);
      details.push(`Removed "${item.title}": ${item.reason}`);
    }
  }

  // Additions: only accepted when the quoted evidence really is in the syllabus.
  let nextId = drafts.length + 1;
  let rejected = 0;
  for (const item of verification.missing) {
    const key = normalize(item.title);
    if (!key || existing.has(key)) continue;
    if (!appearsIn(syllabus, item.evidence)) {
      rejected++;
      continue;
    }
    existing.add(key);
    const draft: Draft = { id: `t${nextId++}`, unit: matchUnit(result, item.unit), title: item.title.trim() };
    // Insert after the last topic of the same unit, so the syllabus order is kept.
    const lastInUnit = result.findLastIndex((d) => d.unit === draft.unit);
    result.splice(lastInUnit >= 0 ? lastInUnit + 1 : result.length, 0, draft);
    details.push(`Added missed topic "${draft.title}" to ${draft.unit}.`);
  }
  if (rejected > 0) {
    details.push(`Rejected ${rejected} suggested topic(s) whose quote could not be found in your syllabus.`);
  }

  const added = result.filter((d) => !drafts.includes(d)).length;
  const removed = drafts.length - (result.length - added);
  const summary =
    added === 0 && removed === 0
      ? "Checked every topic against your syllabus. No problems found."
      : `Checked every topic against your syllabus: added ${added}, removed ${removed}.`;
  return { drafts: result, step: { agent: "verifier", mode: "claude", summary, details } };
}

function matchUnit(drafts: Draft[], unit: string): string {
  const key = normalize(unit);
  return drafts.find((d) => normalize(d.unit) === key)?.unit ?? (unit.trim() || "General");
}

export function applyEstimates(
  drafts: Draft[],
  sources: (Estimates | Error | null)[],
): { topics: Topic[]; step: PipelineStep } {
  const byId = new Map<string, Estimates["estimates"][number]>();
  const errors: string[] = [];
  let usedClaude = false;
  for (const source of sources) {
    if (source instanceof Error) errors.push(errorMessage(source));
    else if (source) {
      usedClaude = true;
      for (const estimate of source.estimates) byId.set(estimate.id, estimate);
    }
  }

  let guessed = 0;
  const topics: Topic[] = drafts.map((draft) => {
    const estimate = byId.get(draft.id);
    if (estimate && Number.isFinite(estimate.hours) && Number.isFinite(estimate.difficulty)) {
      return {
        ...draft,
        difficulty: clamp(Math.round(estimate.difficulty), 1, 5),
        hours: clamp(roundHalf(estimate.hours), 0.5, 12),
      };
    }
    guessed++;
    return { ...draft, ...estimateOffline(draft.title) };
  });

  const total = topics.reduce((sum, t) => sum + t.hours, 0);
  const hardest = [...topics].sort((a, b) => b.difficulty - a.difficulty || b.hours - a.hours)[0];
  const details: string[] = [];
  if (usedClaude && guessed > 0) details.push(`${guessed} topic(s) had no estimate, so simple rules were used for them.`);
  if (errors.length > 0) details.push(`Claude was unavailable (${errors[0]}), so simple rules were used.`);
  if (hardest) details.push(`Hardest topic: "${hardest.title}" (difficulty ${hardest.difficulty}/5, ${hardest.hours}h).`);

  return {
    topics,
    step: {
      agent: "estimator",
      mode: usedClaude ? "claude" : "offline",
      summary: `Estimated about ${roundHalf(total)} hours of study in total.`,
      details,
    },
  };
}

function countUnits(drafts: Draft[]): number {
  return new Set(drafts.map((d) => d.unit)).size;
}

async function settle<T>(promise: Promise<T>): Promise<T | Error> {
  try {
    return await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
