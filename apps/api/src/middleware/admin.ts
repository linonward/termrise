import { createMiddleware } from "hono/factory";

import { AppError } from "@repo/observability/errors";

import { apiEnv, type AppEnv } from "../env";

// After session: only users in ADMIN_USER_IDS. Others get 404, so the admin API does not
// reveal that it exists (docs/architecture/security.md#admin-access).
export const admin = createMiddleware<AppEnv>(async (c, next) => {
  if (!apiEnv(c.env).ADMIN_USER_IDS.includes(c.var.user.id))
    throw new AppError("NOT_FOUND", "Not found");
  await next();
});
