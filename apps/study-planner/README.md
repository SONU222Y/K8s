# StudyPlan

Paste a syllabus, enter your exam date and daily study hours, and get a day-by-day study plan with revision days, progress tracking, automatic rescheduling and a calendar (`.ics`) export.

## How the AI agents make plans more accurate

One model call that "writes a study plan" can miss topics, invent topics, or get the maths wrong. StudyPlan splits the job:

```
syllabus ─► Parser agent ─┬─► Verifier agent ──┐
                          └─► Estimator agent ─┴─► corrections applied ─► Scheduler (plain code) ─► plan
```

| Step | What it does | Accuracy guard |
|---|---|---|
| **Parser** (`lib/agents/parser.ts`) | Turns the syllabus into units and topics | Structured output: the answer must match a schema |
| **Verifier** (`lib/agents/verifier.ts`) | Compares the topic list with the original text and reports missing or invalid items | A missing topic is only added if the verifier's quote really appears in the syllabus. It may not remove more than half the topics |
| **Estimator** (`lib/agents/estimator.ts`) | Rates difficulty (1–5) and study hours per topic | Values are clamped to sane ranges; missing estimates fall back to rules |
| **Scheduler** (`lib/scheduler.ts`) | Packs topics into days and adds revision days | Plain code, so dates and hours always add up |

The verifier and estimator run in parallel to save time. Every Claude step falls back to simple offline rules if the API is unavailable, so the app works without an API key (with lower accuracy).

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for the AI agents
npm run dev                  # http://localhost:3000
```

```bash
npm test          # unit tests (scheduler, parser, verifier rules)
npm run typecheck
npm run build
```

## Deploy to Kubernetes

See [`../../k8s/study-planner/README.md`](../../k8s/study-planner/README.md).
