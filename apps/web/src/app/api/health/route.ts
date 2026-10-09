import { withRequestContext } from "@repo/observability/logger";

import { checkHealth } from "@/server/health/health";

// For uptime monitors: public, no rate limit, no details about what failed.
export const dynamic = "force-dynamic";

export const GET = withRequestContext(async () => {
  const ok = await checkHealth();
  return Response.json(
    { status: ok ? "ok" : "error" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
});
