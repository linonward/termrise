import { createMiddleware } from "hono/factory";

import {
  API_RATE_LIMITS,
  type ApiRateLimitName,
} from "@repo/auth/api-rate-limits";
import { createRateLimitService } from "@repo/auth/rate-limit";

import type { AppEnv } from "../env";

/** Per-user limit under the key `{name}:{userId}`, checked before the body is read. */
export const rateLimit = (name: ApiRateLimitName) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { limit, windowSeconds } = API_RATE_LIMITS[name];
    await createRateLimitService(c.var.db).enforce(
      `${name}:${c.var.user.id}`,
      limit,
      windowSeconds,
    );
    await next();
  });
