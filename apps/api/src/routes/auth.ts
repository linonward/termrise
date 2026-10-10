import { Hono } from "hono";

import { requestAuth, type AuthDeps } from "../auth";
import type { AppEnv } from "../env";
import { database } from "../middleware/database";
import { webCors } from "../middleware/web-cors";

// Better Auth at /api/auth/* (docs/adr/012-api-modular-monolith.md). The web app calls it
// from the browser (CORS with credentials) and shares the session cookie through
// AUTH_COOKIE_DOMAIN. Preflight requests are answered before a connection opens.
export function authRoutes(deps: AuthDeps = {}) {
  return new Hono<AppEnv>()
    .use("*", webCors)
    .use("*", database)
    .on(["GET", "POST"], "/*", (c) => requestAuth(c, deps).handler(c.req.raw));
}
