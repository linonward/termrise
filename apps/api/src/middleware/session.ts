import { createMiddleware } from "hono/factory";

import { AppError } from "@repo/observability/errors";

import { requestAuth } from "../auth";
import type { AppEnv } from "../env";

// Signed-in routes: sets c.var.user, or answers 401. Needs the database middleware first.
export const session = createMiddleware<AppEnv>(async (c, next) => {
  const current = await requestAuth(c).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!current) throw new AppError("UNAUTHORIZED", "Sign in required");
  c.set("user", { id: current.user.id, email: current.user.email });
  await next();
});
