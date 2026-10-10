import { Hono } from "hono";

import type { AuthDeps } from "./auth";
import type { AppEnv } from "./env";
import { errorHandler } from "./middleware/error-handler";
import { analytics } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { health } from "./routes/health";
import { tasks } from "./routes/tasks";
import { uploads } from "./routes/uploads";

// The HTTP API of the modular monolith (docs/adr/012-api-modular-monolith.md). Routes call
// services in packages/*, the same ones apps/worker uses; never implement a rule twice.
export function createApp(deps: AuthDeps = {}) {
  return new Hono<AppEnv>()
    .basePath("/api")
    .route("/health", health)
    .route("/auth", authRoutes(deps))
    .route("/tasks", tasks)
    .route("/uploads", uploads)
    .route("/analytics", analytics)
    .onError(errorHandler);
}
