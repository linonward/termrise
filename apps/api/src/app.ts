import { Hono } from "hono";

import type { AuthDeps } from "./auth";
import type { AppEnv } from "./env";
import { errorHandler } from "./middleware/error-handler";
import { adminRoutes } from "./routes/admin";
import { analytics } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { billing } from "./routes/billing";
import { checkout } from "./routes/checkout";
import { credits } from "./routes/credits";
import { executionRoutes } from "./routes/execution";
import { health } from "./routes/health";
import { opportunityRoutes } from "./routes/opportunities";
import { researchRoutes } from "./routes/research";
import { tasks } from "./routes/tasks";
import { uploads } from "./routes/uploads";
import { webhooks } from "./routes/webhooks";

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
    .route("/checkout", checkout)
    .route("/billing", billing)
    .route("/credits", credits)
    .route("/research", researchRoutes)
    .route("/opportunities", opportunityRoutes)
    .route("/execution", executionRoutes)
    .route("/webhooks", webhooks)
    .route("/admin", adminRoutes)
    .onError(errorHandler);
}
