import { NextResponse } from "next/server";
import { z } from "zod";
import { runPipeline } from "@/lib/agents/pipeline";
import { buildPlan, daysBetween } from "@/lib/scheduler";
import type { PlanResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Must stay below the Ingress proxy timeout (120s).
export const maxDuration = 110;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like 2026-10-31.");

const RequestSchema = z.object({
  syllabus: z.string().trim().min(20, "Please paste a longer syllabus.").max(50_000, "The syllabus is too long."),
  examDate: isoDate,
  hoursPerDay: z.number().min(0.5).max(16),
  startDate: isoDate.optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { syllabus, examDate, hoursPerDay } = parsed.data;
  const startDate = parsed.data.startDate ?? new Date().toISOString().slice(0, 10);

  const totalDays = daysBetween(startDate, examDate);
  if (totalDays <= 0) {
    return NextResponse.json({ error: "The exam date must be after the start date." }, { status: 400 });
  }
  if (totalDays > 366) {
    return NextResponse.json({ error: "Plans can cover at most one year." }, { status: 400 });
  }

  try {
    const { topics, steps } = await runPipeline(syllabus);
    if (topics.length === 0) {
      return NextResponse.json(
        { error: "No study topics were found. Try listing one topic per line under each unit." },
        { status: 400 },
      );
    }
    const plan = buildPlan({ topics, startDate, examDate, hoursPerDay });
    const response: PlanResponse = { topics, plan, pipeline: steps };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Plan generation failed", error);
    return NextResponse.json({ error: "Something went wrong while building your plan. Please try again." }, { status: 500 });
  }
}
