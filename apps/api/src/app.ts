import { Hono } from "hono";

import { errorHandler } from "./middleware/error-handler";
import { health } from "./routes/health";

// Optional standalone API (docs/architecture/overview.md#monorepo). Product routes
// call the same packages as apps/web; never implement a rule twice.
export function createApp() {
  return new Hono().route("/health", health).onError(errorHandler);
}
