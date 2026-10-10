import { createMiddleware } from "hono/factory";

import { connectDb } from "@repo/db/client";
import { logger } from "@repo/observability/logger";

import type { AppEnv } from "../env";

// One connection per request; Hyperdrive keeps the pool (docs/architecture/deployment.md#api).
// The connection closes after the response and after the tasks passed to c.var.defer().
export const database = createMiddleware<AppEnv>(async (c, next) => {
  const db = await connectDb(c.env.HYPERDRIVE.connectionString);
  const deferred: Promise<void>[] = [];
  c.set("db", db);
  c.set("defer", (task) => {
    deferred.push(
      task().catch((error) => logger.error("http.deferred_failed", { error })),
    );
  });
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(
      Promise.allSettled(deferred).then(() => db.close()),
    );
  }
});
