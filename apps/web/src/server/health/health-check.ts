import { sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { logger } from "@repo/observability/logger";

// Readiness for GET /api/health (docs/architecture/observability.md#uptime-monitoring).
// An uptime monitor needs an answer even when the database hangs, so the query has a time limit.
const TIMEOUT_MS = 3000;

export async function checkDatabase(database: Database): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      database.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer in ${TIMEOUT_MS} ms`)),
          TIMEOUT_MS,
        );
      }),
    ]);
    return true;
  } catch (error) {
    logger.warn("health.database_unavailable", { error });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
