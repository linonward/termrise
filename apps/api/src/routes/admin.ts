import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import type { AdminErrorCode } from "@repo/admin/admin-rules";
import { AdminError, createAdminService } from "@repo/admin/admin-service";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import type { AppEnv } from "../env";
import { readJson } from "../http";
import { admin } from "../middleware/admin";
import { listPaidRecords } from "../product";
import { userRoutes } from "./user-routes";

// The admin console (/admin in the web app) calls these from its server: reads and the one
// write. Balances still change only through CreditService.
const ADMIN_ERROR_STATUS: Record<AdminErrorCode, ContentfulStatusCode> = {
  INVALID_INPUT: 400,
  INVALID_AMOUNT: 400,
  INVALID_REASON: 400,
  USER_NOT_FOUND: 404,
  INSUFFICIENT_CREDITS: 402,
  IDEMPOTENCY_CONFLICT: 409,
};

const searchBody = z.object({ query: z.string() });
const adjustBody = z.object({
  amount: z.number(),
  id: z.string(),
  reason: z.string(),
});

const adminService = (c: Context<AppEnv>) =>
  createAdminService(c.var.db, {
    listTasks: (userId, limit) => listPaidRecords(c, userId, limit),
  });

export const adminRoutes = userRoutes()
  .use("*", admin)
  // The web app asks whether to show /admin at all.
  .get("/session", (c) => c.body(null, 204))
  // The email stays in the body: never in a URL or the logs.
  .post("/users/search", async (c) => {
    const body = searchBody.safeParse(await readJson(c));
    if (!body.success) throw new AppError("INVALID_INPUT", "query required");
    const id = await adminService(c).findUserId(body.data.query);
    if (!id) throw new AppError("NOT_FOUND", "No such user");
    return c.json({ id });
  })
  .get("/users/:id", async (c) => {
    const overview = await adminService(c).getUserOverview(c.req.param("id"));
    if (!overview) throw new AppError("NOT_FOUND", "No such user");
    return c.json(overview);
  })
  .post("/users/:id/credits", async (c) => {
    const body = adjustBody.safeParse(await readJson(c));
    if (!body.success)
      throw new AppError("INVALID_INPUT", "Invalid adjustment");
    const actorId = c.var.user.id;
    const userId = c.req.param("id");
    try {
      const result = await adminService(c).adjustCredits({
        actorId,
        userId,
        ...body.data,
      });
      logger.info("admin.credits_adjusted", {
        actorId,
        userId,
        amount: body.data.amount,
        transactionId: result.transactionId,
      });
      return c.json(result);
    } catch (error) {
      if (!(error instanceof AdminError)) throw error;
      return c.json(
        { error: { code: error.code } },
        ADMIN_ERROR_STATUS[error.code],
      );
    }
  });
