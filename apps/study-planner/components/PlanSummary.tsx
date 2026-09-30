import { daysBetween } from "@/lib/scheduler";
import { formatHours } from "@/lib/ics";
import type { PlanRequest, StudyPlan, Topic } from "@/lib/types";
import { formatDay, plural } from "./dates";

interface PlanSummaryProps {
  request: PlanRequest;
  topics: Topic[];
  plan: StudyPlan;
  completedCount: number;
  today: string;
}

export default function PlanSummary({ request, topics, plan, completedCount, today }: PlanSummaryProps) {
  const total = topics.length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const studyDays = plan.days.filter((d) => d.sessions.length > 0).length;
  const plannedHours = plan.days.reduce((sum, d) => sum + d.sessions.reduce((s, x) => s + x.hours, 0), 0);
  const daysLeft = today ? daysBetween(today, request.examDate) : null;

  let examLabel = formatDay(request.examDate);
  if (daysLeft !== null) {
    if (daysLeft > 1) examLabel = `in ${daysLeft} days`;
    else if (daysLeft === 1) examLabel = "tomorrow";
    else if (daysLeft === 0) examLabel = "today";
    else examLabel = "passed";
  }

  return (
    <section className="card summary" aria-label="Plan summary">
      <dl className="stats">
        <div className="stat">
          <dt>Topics</dt>
          <dd>{total}</dd>
        </div>
        <div className="stat">
          <dt>Total days</dt>
          <dd>{plan.days.length}</dd>
        </div>
        <div className="stat">
          <dt>Planned</dt>
          <dd>{formatHours(plannedHours)}</dd>
        </div>
        <div className="stat">
          <dt>Exam</dt>
          <dd title={formatDay(request.examDate)}>{examLabel}</dd>
        </div>
      </dl>

      <div className="progress-block">
        <div className="progress-label" id="progress-label">
          <span>Progress</span>
          <span>
            {completedCount} of {plural(total, "topic")} done · <strong>{percent}%</strong>
          </span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-labelledby="progress-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% of topics completed`}
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        {studyDays < plan.days.length && studyDays > 0 && (
          <p className="hint">
            {plural(plan.days.length - studyDays, "day")} without sessions: use them to rest or catch up.
          </p>
        )}
      </div>
    </section>
  );
}
