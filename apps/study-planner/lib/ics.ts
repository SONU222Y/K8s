import { addDays } from "./scheduler";
import type { StudyPlan, Topic } from "./types";

// Builds an iCalendar file (RFC 5545) with one all-day event per study day.

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

/** Formats hours for people: 1.5 -> "1.5h", 3 -> "3h". */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded}h`;
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Folds a content line so that no physical line is longer than 75 octets.
 * Continuation lines start with a single space, which counts towards their 75 octets.
 * Multi-byte UTF-8 characters are never split.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentOctets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const octets = utf8Length(char.codePointAt(0) ?? 0);
    if (currentOctets + octets > limit) {
      parts.push(current);
      current = "";
      currentOctets = 0;
      limit = MAX_LINE_OCTETS - 1; // room for the leading space
    }
    current += char;
    currentOctets += octets;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function formatStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Small FNV-1a hash so UIDs stay the same when the same syllabus is exported again. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildIcs(plan: StudyPlan, topics: Topic[], now: Date = new Date()): string {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const planKey = hash(topics.map((t) => t.id).join("|"));
  const stamp = formatStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyPlan//Study Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:StudyPlan",
  ];

  for (const day of plan.days) {
    if (day.sessions.length === 0) continue;
    const totalHours = day.sessions.reduce((sum, s) => sum + s.hours, 0);
    const topicCount = new Set(day.sessions.map((s) => s.topicId)).size;
    const summary = `Study: ${formatHours(totalHours)} (${topicCount} ${topicCount === 1 ? "topic" : "topics"})`;
    const description = day.sessions
      .map((session) => {
        const topic = byId.get(session.topicId);
        const kind = session.kind === "learn" ? "Learn" : "Revise";
        const parts = [kind, topic?.unit, topic?.title ?? session.topicId, formatHours(session.hours)];
        return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
      })
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:studyplan-${compactDate(day.date)}-${planKey}@studyplan.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(day.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(day.date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
