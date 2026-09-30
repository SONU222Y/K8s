"use client";

import { useState } from "react";
import { formatHours } from "@/lib/ics";
import type { StudyDay, Topic } from "@/lib/types";
import Difficulty from "./Difficulty";
import { formatDay, plural } from "./dates";

interface DayListProps {
  days: StudyDay[];
  topicsById: Map<string, Topic>;
  completed: Set<string>;
  today: string;
  examDate: string;
}

export default function DayList({ days, topicsById, completed, today, examDate }: DayListProps) {
  const [showPast, setShowPast] = useState(false);
  const past = days.filter((d) => d.date < today);
  const upcoming = days.filter((d) => d.date >= today);
  const visible = showPast ? days : upcoming;

  return (
    <section className="card days" aria-labelledby="days-heading">
      <h2 id="days-heading">Day by day</h2>

      {past.length > 0 && (
        <button
          type="button"
          className="btn btn-link past-toggle"
          aria-expanded={showPast}
          aria-controls="day-list"
          onClick={() => setShowPast((v) => !v)}
        >
          {showPast ? "Hide past days" : `Show ${plural(past.length, "past day")}`}
        </button>
      )}

      <ol className="day-list" id="day-list">
        {visible.map((day) => (
          <DayItem
            key={day.date}
            day={day}
            topicsById={topicsById}
            completed={completed}
            isToday={day.date === today}
            isPast={day.date < today}
          />
        ))}
        {examDate >= today && (
          <li className="day day-exam">
            <div className="day-head">
              <h3 className="day-date">{formatDay(examDate)}</h3>
              <span className="chip chip-exam">Exam day</span>
            </div>
            <p className="hint">Good luck! Nothing is planned for today except the exam.</p>
          </li>
        )}
      </ol>
    </section>
  );
}

interface DayItemProps {
  day: StudyDay;
  topicsById: Map<string, Topic>;
  completed: Set<string>;
  isToday: boolean;
  isPast: boolean;
}

function DayItem({ day, topicsById, completed, isToday, isPast }: DayItemProps) {
  const total = day.sessions.reduce((sum, s) => sum + s.hours, 0);
  const className = ["day", isToday ? "day-today" : "", isPast ? "day-past" : ""].filter(Boolean).join(" ");

  return (
    <li className={className} aria-current={isToday ? "date" : undefined}>
      <div className="day-head">
        <h3 className="day-date">{formatDay(day.date)}</h3>
        {isToday && <span className="chip chip-today">Today</span>}
        {total > 0 && <span className="day-total">{formatHours(total)}</span>}
      </div>
      {day.sessions.length === 0 ? (
        <p className="hint">Free day: rest or catch up.</p>
      ) : (
        <ul className="sessions">
          {day.sessions.map((session, i) => {
            const topic = topicsById.get(session.topicId);
            const done = completed.has(session.topicId);
            return (
              <li key={`${session.topicId}-${session.kind}-${i}`} className={done ? "session session-done" : "session"}>
                <span className={`badge badge-${session.kind}`}>{session.kind === "learn" ? "Learn" : "Revise"}</span>
                <span className="session-main">
                  <span className="session-title">
                    {topic?.title ?? "Unknown topic"}
                    {done && <span className="visually-hidden"> (completed)</span>}
                  </span>
                  {topic?.unit && <span className="session-unit">{topic.unit}</span>}
                </span>
                <span className="session-meta">
                  {topic && <Difficulty level={topic.difficulty} />}
                  <span className="session-hours">{formatHours(session.hours)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
