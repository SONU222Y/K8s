import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

/** True when the server has credentials for the Claude API. Without them the offline pipeline is used. */
export function claudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class AgentError extends Error {}

/**
 * Runs one agent: a single Claude call whose answer must match `schema`.
 * Each agent has its own system prompt, so it focuses on one job.
 */
export async function runAgent<Schema extends z.ZodType>(options: {
  system: string;
  prompt: string;
  schema: Schema;
  effort: "low" | "medium" | "high";
}): Promise<z.infer<Schema>> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: options.effort, format: betaZodOutputFormat(options.schema) },
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new AgentError("Claude declined to process this syllabus.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AgentError("The syllabus is too long for one request.");
  }
  if (response.parsed_output == null) {
    throw new AgentError("Claude returned an answer in an unexpected format.");
  }
  return response.parsed_output;
}
