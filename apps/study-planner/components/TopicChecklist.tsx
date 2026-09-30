"use client";

import { formatHours } from "@/lib/ics";
import type { Topic } from "@/lib/types";
import Difficulty from "./Difficulty";

interface TopicChecklistProps {
  topics: Topic[];
  completed: Set<string>;
  onToggle: (topicId: string) => void;
}

function groupByUnit(topics: Topic[]): Array<{ unit: string; topics: Topic[] }> {
  const groups = new Map<string, Topic[]>();
  for (const topic of topics) {
    const unit = topic.unit.trim() || "Other topics";
    const list = groups.get(unit);
    if (list) list.push(topic);
    else groups.set(unit, [topic]);
  }
  return Array.from(groups, ([unit, list]) => ({ unit, topics: list }));
}

export default function TopicChecklist({ topics, completed, onToggle }: TopicChecklistProps) {
  const groups = groupByUnit(topics);

  return (
    <section className="card checklist" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading">Topics</h2>
      <p className="hint">Tick a topic when you&apos;ve finished learning it.</p>
      {groups.map((group, gi) => {
        const done = group.topics.filter((t) => completed.has(t.id)).length;
        return (
          <fieldset key={`${group.unit}-${gi}`} className="unit-group">
            <legend>
              <span className="unit-name">{group.unit}</span>
              <span className="unit-count">
                {done}/{group.topics.length}
              </span>
            </legend>
            <ul className="topic-list">
              {group.topics.map((topic, ti) => {
                const id = `topic-${gi}-${ti}`;
                const checked = completed.has(topic.id);
                return (
                  <li key={topic.id} className={checked ? "topic topic-done" : "topic"}>
                    <input id={id} type="checkbox" checked={checked} onChange={() => onToggle(topic.id)} />
                    <label htmlFor={id}>
                      <span className="topic-title">{topic.title}</span>
                      <span className="topic-meta">
                        <Difficulty level={topic.difficulty} />
                        <span>{formatHours(topic.hours)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </section>
  );
}
