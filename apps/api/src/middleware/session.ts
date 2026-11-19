import { createMiddleware } from "hono/factory";

import { createAgentTokens } from "@repo/auth/agent-tokens";
import { AppError } from "@repo/observability/errors";

import { requestAuth } from "../auth";
import type { AppEnv } from "../env";

// Signed-in routes: sets c.var.user, or answers 401. Needs the database middleware first.
// An AI agent signs in with `Authorization: Bearer trk_…` instead of the session cookie
// (docs/architecture/security.md#agent-tokens) and then calls the same routes.
export const session = createMiddleware<AppEnv>(async (c, next) => {
  const bearer = c.req
    .header("authorization")
    ?.match(/^Bearer (trk_\S+)$/)?.[1];
  if (bearer) {
    const owner = await createAgentTokens({ database: c.var.db }).verify(
      bearer,
    );
    if (!owner) throw new AppError("UNAUTHORIZED", "Invalid agent token");
    c.set("user", owner);
    return next();
  }
  const current = await requestAuth(c).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!current) throw new AppError("UNAUTHORIZED", "Sign in required");
  c.set("user", { id: current.user.id, email: current.user.email });
  await next();
});
