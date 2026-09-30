import type { PipelineStep } from "@/lib/types";

const AGENT_INFO: Record<PipelineStep["agent"], { name: string; role: string }> = {
  parser: {
    name: "Syllabus reader",
    role: "Reads your syllabus and turns it into a list of units and topics.",
  },
  verifier: {
    name: "Checker",
    role: "Compares that list with your original text to catch missing or made-up topics.",
  },
  estimator: {
    name: "Difficulty estimator",
    role: "Rates how hard each topic is and how many hours it needs.",
  },
};

export default function PipelinePanel({ steps }: { steps: PipelineStep[] }) {
  if (steps.length === 0) return null;
  const anyOffline = steps.some((s) => s.mode === "offline");

  return (
    <section className="card pipeline" aria-labelledby="pipeline-heading">
      <h2 id="pipeline-heading">How your plan was checked</h2>
      <p className="muted">
        Your plan wasn&apos;t written by a single guess. Each step below was done by a separate agent, and
        the final schedule was calculated with plain maths so the dates always add up.
      </p>
      <ol className="pipeline-steps">
        {steps.map((step, i) => {
          const info = AGENT_INFO[step.agent];
          return (
            <li key={`${step.agent}-${i}`} className="pipeline-step">
              <span className="step-number" aria-hidden="true">
                {i + 1}
              </span>
              <div className="step-body">
                <div className="step-head">
                  <h3>{info.name}</h3>
                  <span className={`badge badge-${step.mode}`}>
                    {step.mode === "claude" ? "AI (Claude)" : "Offline rules"}
                  </span>
                </div>
                <p className="hint">{info.role}</p>
                <p className="step-summary">{step.summary}</p>
                {step.details && step.details.length > 0 && (
                  <details>
                    <summary>Show details ({step.details.length})</summary>
                    <ul className="step-details">
                      {step.details.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {anyOffline && (
        <p className="hint">
          &ldquo;Offline rules&rdquo; means the AI wasn&apos;t available for that step, so simple built-in
          rules were used instead. Double-check the topic list below.
        </p>
      )}
    </section>
  );
}
