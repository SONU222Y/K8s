// Liveness/readiness/startup probe endpoint for Kubernetes.
// Must stay dependency-free and fast: no DB, no Claude API calls.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { status: 200 });
}
