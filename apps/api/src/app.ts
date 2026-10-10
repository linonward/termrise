import { Hono } from "hono";

import type { AppEnv } from "./env";
import { errorHandler } from "./middleware/error-handler";
import { health } from "./routes/health";

// The HTTP API of the modular monolith (docs/adr/012-api-modular-monolith.md). Routes call
// services in packages/*, the same ones apps/worker uses; never implement a rule twice.
export function createApp() {
  return new Hono<AppEnv>()
    .basePath("/api")
    .route("/health", health)
    .onError(errorHandler);
}
