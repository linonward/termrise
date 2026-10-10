import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";

import { AppError } from "@repo/observability/errors";

import { apiEnv, type AppEnv } from "../env";

// A form or text/plain post is sent without a CORS preflight, with the session cookie from
// a sibling subdomain: accept it from the web app's origin only. JSON requests are
// covered by the preflight (web-cors.ts).
export const webCsrf = createMiddleware<AppEnv>(async (c, next) => {
  const check = csrf({ origin: new URL(apiEnv(c.env).APP_URL).origin });
  // Hono's check throws its own 403; answer with the error contract instead.
  await check(c, async () => {}).catch(() => {
    throw new AppError("FORBIDDEN", "Origin not allowed");
  });
  await next();
});
