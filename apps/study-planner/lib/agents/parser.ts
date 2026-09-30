import { z } from "zod";
import { runAgent } from "./claude";

export const ParsedSyllabusSchema = z.object({
  units: z.array(
    z.object({
      name: z.string(),
      topics: z.array(z.string()),
    }),
  ),
});
export type ParsedSyllabus = z.infer<typeof ParsedSyllabusSchema>;

const SYSTEM = `You turn a course syllabus into a clean list of study topics for a student's study plan.

- Keep the syllabus order, because later topics often build on earlier ones.
- Group topics under their unit, module or chapter. If the syllabus has no units, use one unit called "General".
- Use the syllabus's own wording for topic titles. Shorten only when a title is very long.
- Split a line that lists several separate topics into one topic each. Merge tiny sub-points into their parent topic, so each topic takes roughly 1 to 6 hours to study.
- Leave out things that are not study material: grading, attendance, dates, textbooks, instructor details, course policies.
- Never add topics that are not in the syllabus.`;

export function parseWithClaude(syllabus: string): Promise<ParsedSyllabus> {
  return runAgent({
    system: SYSTEM,
    prompt: `<syllabus>\n${syllabus}\n</syllabus>`,
    schema: ParsedSyllabusSchema,
    effort: "medium",
  });
}
