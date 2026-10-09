import "server-only";
import { createRateLimitService } from "@repo/auth/rate-limit";
import { db } from "@repo/db/client";

import { requireUser } from "@/server/auth/auth";

import { API_RATE_LIMITS } from "./rate-limits";
import { createUserRoute } from "./route";

/** Wraps a signed-in API route: `export const POST = userRoute({ rateLimit: "task" }, handler)`. */
export const userRoute = createUserRoute({
  requireUser,
  enforceRateLimit: (limit, key) =>
    createRateLimitService(db()).enforce(
      key,
      API_RATE_LIMITS[limit].limit,
      API_RATE_LIMITS[limit].windowSeconds,
    ),
});
