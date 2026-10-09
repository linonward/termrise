import { sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { rateLimits } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

// Fixed-window counter in Postgres: docs/architecture/security.md#rate-limiting.
// Product API limits live in the app (apps/web/src/server/http/rate-limits.ts).
export const MAGIC_LINK_LIMITS = {
  magicLinkEmail: { limit: 3, windowSeconds: 600 },
  magicLinkIp: { limit: 10, windowSeconds: 3600 },
  magicLinkIpDaily: { limit: 20, windowSeconds: 86400 },
  // Below the Resend Free cap of 100 emails per day; raise after upgrading Resend.
  magicLinkDaily: { limit: 90, windowSeconds: 86400 },
} as const;

export function createRateLimitService(
  database: Database,
  now: () => Date = () => new Date(),
) {
  async function enforce(key: string, limit: number, windowSeconds: number) {
    const time = now().getTime();
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(time / windowMs) * windowMs);
    const [{ count }] = await database
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    if (count > limit)
      throw new AppError(
        "RATE_LIMITED",
        "Too many requests",
        Math.ceil((windowStart.getTime() + windowMs - time) / 1000),
      );
  }
  return { enforce };
}
