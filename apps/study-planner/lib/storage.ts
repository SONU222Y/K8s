import type { PipelineStep, PlanRequest, PlanResponse, StudyDay, StudyPlan, StudySession, Topic } from "./types";

// Saves the current plan in localStorage. Storage can be missing or throw
// (private mode, blocked cookies, quota), so every access is guarded and the
// app keeps working without it.

export interface SavedState {
  request: PlanRequest;
  topics: Topic[];
  plan: StudyPlan;
  pipeline: PipelineStep[];
  completedIds: string[];
}

const STORAGE_KEY = "studyplan:state:v1";

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Returns true when the state was written. */
export function saveState(state: SavedState): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadState(): SavedState | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return isSavedState(data) ? data : null;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the in-memory state is cleared by the caller.
  }
}

// ---- Shape checks (also used to validate API responses) ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function isTopic(value: unknown): value is Topic {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.unit === "string" &&
    typeof value.title === "string" &&
    typeof value.difficulty === "number" &&
    typeof value.hours === "number"
  );
}

function isSession(value: unknown): value is StudySession {
  return (
    isRecord(value) &&
    typeof value.topicId === "string" &&
    typeof value.hours === "number" &&
    (value.kind === "learn" || value.kind === "revise")
  );
}

function isDay(value: unknown): value is StudyDay {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isSession)
  );
}

export function isStudyPlan(value: unknown): value is StudyPlan {
  return (
    isRecord(value) &&
    Array.isArray(value.days) &&
    value.days.every(isDay) &&
    typeof value.overflowHours === "number" &&
    isStringArray(value.warnings)
  );
}

export function isPipelineStep(value: unknown): value is PipelineStep {
  return (
    isRecord(value) &&
    (value.agent === "parser" || value.agent === "verifier" || value.agent === "estimator") &&
    (value.mode === "claude" || value.mode === "offline") &&
    typeof value.summary === "string" &&
    (value.details === undefined || isStringArray(value.details))
  );
}

function isPlanRequest(value: unknown): value is PlanRequest {
  return (
    isRecord(value) &&
    typeof value.syllabus === "string" &&
    typeof value.examDate === "string" &&
    typeof value.hoursPerDay === "number" &&
    (value.startDate === undefined || typeof value.startDate === "string")
  );
}

export function isPlanResponse(value: unknown): value is PlanResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.topics) &&
    value.topics.every(isTopic) &&
    isStudyPlan(value.plan) &&
    Array.isArray(value.pipeline) &&
    value.pipeline.every(isPipelineStep)
  );
}

function isSavedState(value: unknown): value is SavedState {
  return (
    isRecord(value) &&
    isPlanRequest(value.request) &&
    Array.isArray(value.topics) &&
    value.topics.every(isTopic) &&
    isStudyPlan(value.plan) &&
    Array.isArray(value.pipeline) &&
    value.pipeline.every(isPipelineStep) &&
    isStringArray(value.completedIds)
  );
}
