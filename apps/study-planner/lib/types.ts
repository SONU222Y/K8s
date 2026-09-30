// Shared types used by the agent pipeline, the scheduler, the API and the UI.

export interface Topic {
  id: string;
  unit: string;
  title: string;
  /** 1 (easy) to 5 (very hard). */
  difficulty: number;
  /** Estimated study hours for a first pass, excluding revision. */
  hours: number;
}

export interface PlanInput {
  topics: Topic[];
  /** ISO date (YYYY-MM-DD) of the first study day. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) of the exam. No studying is scheduled on it. */
  examDate: string;
  hoursPerDay: number;
  /** Topic ids already completed; they are left out of the schedule. */
  completedIds?: string[];
}

export interface StudySession {
  topicId: string;
  hours: number;
  kind: "learn" | "revise";
}

export interface StudyDay {
  date: string;
  sessions: StudySession[];
}

export interface StudyPlan {
  days: StudyDay[];
  /** Hours of learning that did not fit before the exam. 0 means the plan is feasible. */
  overflowHours: number;
  warnings: string[];
}

/** One step of the agent pipeline, shown to the user so they can see how the plan was checked. */
export interface PipelineStep {
  agent: "parser" | "verifier" | "estimator";
  mode: "claude" | "offline";
  summary: string;
  details?: string[];
}

export interface PlanRequest {
  syllabus: string;
  examDate: string;
  hoursPerDay: number;
  startDate?: string;
}

export interface PlanResponse {
  topics: Topic[];
  plan: StudyPlan;
  pipeline: PipelineStep[];
}
