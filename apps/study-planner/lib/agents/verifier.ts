import { z } from "zod";
import { runAgent } from "./claude";

export const VerificationSchema = z.object({
  missing: z.array(
    z.object({
      unit: z.string(),
      title: z.string(),
      evidence: z.string(),
    }),
  ),
  invalid: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
    }),
  ),
});
export type Verification = z.infer<typeof VerificationSchema>;

const SYSTEM = `You are a strict reviewer checking another assistant's work. It extracted study topics from a syllabus, and you compare its list against the original text.

Report two kinds of problems:
1. "missing": study topics that are in the syllabus but not in the list. For each, give the unit it belongs to, a short title, and "evidence": a short passage copied exactly, character for character, from the syllabus that mentions it. Your additions are only accepted if the evidence matches the syllabus text exactly.
2. "invalid": items in the list that are not study material from this syllabus, such as invented topics, grading rules, textbook names or dates. Use the title exactly as it appears in the list.

Do not report differences in wording, grouping or order. A topic counts as covered if the list includes it under any title. If the list is accurate, return empty arrays.`;

export function verifyWithClaude(syllabus: string, topics: { unit: string; title: string }[]): Promise<Verification> {
  const list = topics.map((t) => `- [${t.unit}] ${t.title}`).join("\n");
  return runAgent({
    system: SYSTEM,
    prompt: `<syllabus>\n${syllabus}\n</syllabus>\n\n<extracted_topics>\n${list}\n</extracted_topics>`,
    schema: VerificationSchema,
    effort: "high",
  });
}
