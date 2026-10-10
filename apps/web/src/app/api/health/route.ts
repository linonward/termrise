// For uptime monitors: public, never cached. The web app has no database of its own;
// apps/api's /api/health checks the database (docs/architecture/observability.md#uptime-monitoring).
export const dynamic = "force-dynamic";

export const GET = () =>
  Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
