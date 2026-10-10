import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

import { apiEnv, type AppEnv } from "../env";

// The web app (APP_URL) is the only browser origin, with cookies
// (docs/architecture/security.md#auth-on-the-api).
export const webCors = createMiddleware<AppEnv>((c, next) => {
  const appOrigin = new URL(apiEnv(c.env).APP_URL).origin;
  return cors({
    origin: (origin) => (origin === appOrigin ? origin : null),
    credentials: true,
  })(c, next);
});
