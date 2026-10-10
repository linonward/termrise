import { Hono } from "hono";

import { connectDb } from "@repo/db/client";
import { checkDatabase } from "@repo/db/health";
import { logger } from "@repo/observability/logger";

import type { AppEnv } from "../env";

// For uptime monitors: public, no rate limit, no details about what failed
// (docs/architecture/observability.md#uptime-monitoring).
export const health = new Hono<AppEnv>().get("/", async (c) => {
  let ok = false;
  try {
    const database = await connectDb(c.env.HYPERDRIVE.connectionString);
    try {
      ok = await checkDatabase(database);
    } finally {
      c.executionCtx.waitUntil(database.close());
    }
  } catch (error) {
    logger.warn("health.database_unavailable", { error });
  }
  return c.json({ status: ok ? "ok" : "error" }, ok ? 200 : 503, {
    "Cache-Control": "no-store",
  });
});
