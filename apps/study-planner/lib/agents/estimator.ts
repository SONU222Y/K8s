import { z } from "zod";
import { runAgent } from "./claude";

export const EstimatesSchema = z.object({
  estimates: z.array(
    z.object({
      id: z.string(),
      difficulty: z.number().int(),
      hours: z.number(),
      reason: z.string(),
    }),
  ),
});
export type Estimates = z.infer<typeof EstimatesSchema>;

const SYSTEM = `You estimate how hard each topic of a course is and how long a typical student at this course's level needs to learn it for the first time.

For each topic give:
- "difficulty": an integer from 1 (easy, mostly definitions) to 5 (very hard, heavy on problem solving or proofs).
- "hours": realistic hours for reading, making notes and practising problems, from 0.5 to 12, in steps of 0.5. Do not include revision time.
- "reason": one short sentence explaining the estimate.

Use the whole syllabus to judge the course level: an introductory school course needs less time per topic than an advanced university one. Return one estimate for every topic id you are given.`;

export function estimateWithClaude(
  syllabus: string,
  topics: { id: string; unit: string; title: string }[],
): Promise<Estimates> {
  const list = topics.map((t) => `${t.id}: [${t.unit}] ${t.title}`).join("\n");
  return runAgent({
    system: SYSTEM,
    prompt: `<syllabus>\n${syllabus}\n</syllabus>\n\n<topics>\n${list}\n</topics>`,
    schema: EstimatesSchema,
    effort: "medium",
  });
}
