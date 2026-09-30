"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildIcs } from "@/lib/ics";
import { buildPlan } from "@/lib/scheduler";
import { clearState, isPlanResponse, loadState, saveState, type SavedState } from "@/lib/storage";
import type { PlanRequest, PlanResponse } from "@/lib/types";
import { formatDay, localToday } from "./dates";
import PlanForm from "./PlanForm";
import PlanView from "./PlanView";

const REQUEST_TIMEOUT_MS = 120_000;

type AbortReason = "cancel" | "timeout" | null;

async function requestPlan(body: PlanRequest, signal: AbortSignal): Promise<PlanResponse> {
  let res: Response;
  try {
    res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON; handled below.
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Something went wrong on the server (error ${res.status}). Please try again.`;
    throw new Error(message);
  }
  if (!isPlanResponse(data)) {
    throw new Error("The server sent a response we didn't understand. Please try again.");
  }
  return data;
}

function focusById(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export default function StudyPlanner() {
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState("");
  const [state, setState] = useState<SavedState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const abortReason = useRef<AbortReason>(null);

  // Restore saved state on the client only, so server and client render the same first frame.
  useEffect(() => {
    setState(loadState());
    setToday(localToday());
    setHydrated(true);

    // Keep "today" right if the tab stays open past midnight.
    const refreshToday = () => setToday(localToday());
    document.addEventListener("visibilitychange", refreshToday);
    window.addEventListener("focus", refreshToday);
    return () => {
      document.removeEventListener("visibilitychange", refreshToday);
      window.removeEventListener("focus", refreshToday);
      abortRef.current?.abort();
    };
  }, []);

  const commit = useCallback((next: SavedState) => {
    setState(next);
    setStorageOk(saveState(next));
  }, []);

  async function handleSubmit(request: PlanRequest) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    abortReason.current = null;
    const timer = window.setTimeout(() => {
      abortReason.current = "timeout";
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await requestPlan(request, controller.signal);
      commit({
        request,
        topics: response.topics,
        plan: response.plan,
        pipeline: response.pipeline,
        completedIds: [],
      });
      focusById("plan-heading");
    } catch (err) {
      if (controller.signal.aborted) {
        if (abortReason.current === "timeout") {
          setError("This is taking longer than expected. Please try again in a moment.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
      setSubmitting(false);
    }
  }

  function handleCancel() {
    abortReason.current = "cancel";
    abortRef.current?.abort();
  }

  function handleToggle(topicId: string) {
    if (!state) return;
    const done = new Set(state.completedIds);
    if (done.has(topicId)) done.delete(topicId);
    else done.add(topicId);
    commit({ ...state, completedIds: state.topics.map((t) => t.id).filter((id) => done.has(id)) });
  }

  function handleReschedule() {
    if (!state) return;
    const now = localToday();
    setToday(now);
    const plan = buildPlan({
      topics: state.topics,
      startDate: now,
      examDate: state.request.examDate,
      hoursPerDay: state.request.hoursPerDay,
      completedIds: state.completedIds,
    });
    commit({ ...state, plan, request: { ...state.request, startDate: now } });
    const remaining = state.topics.length - state.completedIds.length;
    setNotice(
      remaining === 0
        ? `All topics are done! Your plan from ${formatDay(now)} is now free for rest and revision.`
        : `Plan rebuilt from today (${formatDay(now)}) with the ${remaining} topics you still have to learn.`,
    );
  }

  function handleDownload() {
    if (!state) return;
    try {
      const ics = buildIcs(state.plan, state.topics);
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `study-plan-${state.request.examDate}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Calendar file downloaded. Open it to add your study days to your calendar.");
    } catch {
      setNotice("Sorry, the calendar file couldn't be created in this browser.");
    }
  }

  function handleStartOver() {
    clearState();
    setState(null);
    setError(null);
    setNotice(null);
    focusById("form-heading");
  }

  if (!hydrated) {
    return (
      <p className="muted boot" role="status">
        Loading…
      </p>
    );
  }

  if (state) {
    return (
      <PlanView
        state={state}
        today={today}
        notice={notice}
        storageOk={storageOk}
        onToggle={handleToggle}
        onReschedule={handleReschedule}
        onDownload={handleDownload}
        onStartOver={handleStartOver}
      />
    );
  }

  return (
    <PlanForm today={today} submitting={submitting} error={error} onSubmit={handleSubmit} onCancel={handleCancel} />
  );
}
