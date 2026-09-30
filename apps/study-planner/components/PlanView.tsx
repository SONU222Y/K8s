"use client";

import { useMemo, useState } from "react";
import type { SavedState } from "@/lib/storage";
import { formatHours } from "@/lib/ics";
import DayList from "./DayList";
import PipelinePanel from "./PipelinePanel";
import PlanSummary from "./PlanSummary";
import TopicChecklist from "./TopicChecklist";
import { formatDayWithYear, plural } from "./dates";

interface PlanViewProps {
  state: SavedState;
  today: string;
  notice: string | null;
  storageOk: boolean;
  onToggle: (topicId: string) => void;
  onReschedule: () => void;
  onDownload: () => void;
  onStartOver: () => void;
}

export default function PlanView({
  state,
  today,
  notice,
  storageOk,
  onToggle,
  onReschedule,
  onDownload,
  onStartOver,
}: PlanViewProps) {
  const { request, topics, plan, pipeline } = state;
  const [confirming, setConfirming] = useState(false);

  const completed = useMemo(() => new Set(state.completedIds), [state.completedIds]);
  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const completedCount = topics.filter((t) => completed.has(t.id)).length;

  const canReschedule = Boolean(today) && today < request.examDate;
  const hasSessions = plan.days.some((d) => d.sessions.length > 0);
  const missedSessions = plan.days
    .filter((d) => d.date < today)
    .reduce((count, d) => count + d.sessions.filter((s) => !completed.has(s.topicId)).length, 0);

  return (
    <div className="plan">
      <div className="plan-header">
        <div>
          <h2 id="plan-heading" tabIndex={-1}>
            Your study plan
          </h2>
          <p className="muted">
            Exam on {formatDayWithYear(request.examDate)} · {formatHours(request.hoursPerDay)} per day
          </p>
        </div>
        <div className="toolbar" role="group" aria-label="Plan actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onReschedule}
            disabled={!canReschedule}
            title={canReschedule ? undefined : "The exam date has passed"}
          >
            Reschedule from today
          </button>
          <button type="button" className="btn btn-secondary" onClick={onDownload} disabled={!hasSessions}>
            Download calendar (.ics)
          </button>
          {confirming ? (
            <span className="confirm">
              <span>Delete this plan?</span>
              <button type="button" className="btn btn-danger" onClick={onStartOver}>
                Yes, start over
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} autoFocus>
                Keep plan
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
              Start over
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" className="live-region">
        {notice && <p className="alert alert-success">{notice}</p>}
      </div>

      {!storageOk && (
        <p className="alert alert-info">
          Your browser isn&apos;t letting this page save data, so this plan will be lost when you close the tab.
          Download the calendar file to keep a copy.
        </p>
      )}

      {!canReschedule && (
        <p className="alert alert-info">
          This exam date has passed. Start over to plan for your next exam.
        </p>
      )}

      <PlanSummary
        request={request}
        topics={topics}
        plan={plan}
        completedCount={completedCount}
        today={today}
      />

      {plan.warnings.length > 0 && (
        <div className="alert alert-warning" role="note" aria-labelledby="warnings-heading">
          <h2 id="warnings-heading" className="alert-title">
            Heads up
          </h2>
          <ul>
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {missedSessions > 0 && canReschedule && (
        <div className="alert alert-suggest">
          <p>
            <strong>Fallen behind?</strong> You have {plural(missedSessions, "unfinished session")} on past days.
            Tick the topics you&apos;ve finished, then reschedule to spread the rest over the days you have left.
          </p>
          <button type="button" className="btn btn-primary" onClick={onReschedule}>
            Reschedule from today
          </button>
        </div>
      )}

      <PipelinePanel steps={pipeline} />

      <div className="plan-grid">
        <DayList
          days={plan.days}
          topicsById={topicsById}
          completed={completed}
          today={today}
          examDate={request.examDate}
        />
        <TopicChecklist topics={topics} completed={completed} onToggle={onToggle} />
      </div>
    </div>
  );
}
