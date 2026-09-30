"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Reading your syllabus…",
  "Listing every unit and topic…",
  "Checking for missing topics…",
  "Comparing against the original text…",
  "Estimating difficulty…",
  "Working out how long each topic needs…",
  "Packing topics into study days…",
];

const STEP_MS = 3500;

export default function LoadingPanel() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const index = Math.floor(elapsed / STEP_MS) % MESSAGES.length;
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="loading-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="loading-message">{MESSAGES[index]}</p>
        <p className="hint">
          Three AI agents are reading and checking your syllabus. This usually takes 30 to 60 seconds.
          <span className="elapsed" aria-hidden="true">
            {" "}
            ({seconds}s)
          </span>
        </p>
      </div>
    </div>
  );
}
