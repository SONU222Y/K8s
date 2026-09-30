import type { ParsedSyllabus } from "./parser";
import { clamp, roundHalf } from "./text";

// Rule-based stand-ins for the Claude agents. They are used when no API key is
// configured or a Claude call fails, so the app always produces a plan.

// "Unit 2: Cells", "MODULE III – Kinetics", "# Algebra". The \b stops "Partial derivatives" matching "part".
const HEADING = /^(?:#+\s*(.+)|((?:unit|module|chapter|part|section|week)\b.*))$/i;
const BULLET = /^\s*(?:[-*•▪◦]|\d+(?:\.\d+)*[.)]?|[a-z][.)]|[ivx]+[.)])\s+/i;

export function parseOffline(syllabus: string): ParsedSyllabus {
  const units: ParsedSyllabus["units"] = [];
  let current: ParsedSyllabus["units"][number] | null = null;

  const startUnit = (name: string) => {
    current = { name, topics: [] };
    units.push(current);
    return current;
  };

  for (const rawLine of syllabus.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(HEADING);
    if (heading && !BULLET.test(rawLine)) {
      // "Unit 2: Cells, Tissues; Organs" → unit "Unit 2" with the listed topics.
      // "Unit 1: Introduction to Biology" stays a unit name; its topics follow below.
      const text = (heading[1] ?? heading[2]).trim();
      const [name, rest] = splitOnce(text, /\s*[:–—-]\s+|:\s*/);
      if (rest && /[,;]/.test(rest)) {
        startUnit(name.trim()).topics.push(...splitTopics(rest));
      } else {
        startUnit(text.replace(/:$/, ""));
      }
      continue;
    }
    if (line.endsWith(":") && !BULLET.test(rawLine)) {
      startUnit(line.slice(0, -1).trim());
      continue;
    }

    const topicText = line.replace(BULLET, "").trim();
    if (!topicText) continue;
    (current ?? startUnit("General")).topics.push(...splitTopics(topicText));
  }

  return { units: units.filter((u) => u.topics.length > 0) };
}

function splitOnce(text: string, separator: RegExp): [string, string | undefined] {
  const match = separator.exec(text);
  if (!match) return [text, undefined];
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

/** Splits "A, B; C" into separate topics. */
function splitTopics(text: string): string[] {
  return text
    .split(/\s*[;,]\s*/)
    .map((t) => t.replace(/[.]+$/, "").trim())
    .filter((t) => t.length > 1);
}

const HARD_WORDS =
  /\b(advanced|analysis|theorem|proof|derivation|differential|integra\w*|calculus|algorithm|optimi[sz]ation|thermodynamics|quantum|electromagnet\w*|kinetics|mechanism|statistics|probability|complexity|design|synthesis)\b/i;
const EASY_WORDS = /\b(introduction|intro|basics?|overview|definitions?|history|fundamentals|revision|recap)\b/i;

export function estimateOffline(title: string): { difficulty: number; hours: number } {
  let difficulty = 3;
  if (HARD_WORDS.test(title)) difficulty += 1;
  if (EASY_WORDS.test(title)) difficulty -= 1;
  if (title.split(/\s+/).length > 8) difficulty += 1;
  difficulty = clamp(difficulty, 1, 5);
  return { difficulty, hours: Math.max(1, roundHalf(0.5 + difficulty * 0.75)) };
}
