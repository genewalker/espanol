// Liveness only. Convex readiness is checked separately through health.check.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
