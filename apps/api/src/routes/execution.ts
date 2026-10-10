import type { Context } from "hono";

import {
  toExecutionDetailDto,
  toExecutionEventDto,
  toExecutionProjectDto,
  toRevenueEventDto,
} from "@repo/execution/execution-dto";
import { createExecutionService } from "@repo/execution/execution-service";

import type { AppEnv } from "../env";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

const execution = (c: Context<AppEnv>) =>
  createExecutionService({ database: c.var.db });

// Products built from Go opportunities (docs/architecture/data-model.md#execution-and-revenue).
// Writes share the research limit.
export const executionRoutes = userRoutes()
  .get("/projects", async (c) => {
    const items = await execution(c).list(
      c.var.user.id,
      c.req.query("opportunityId"),
    );
    return c.json({ items: items.map(toExecutionProjectDto) });
  })
  .post("/projects", rateLimit("research"), async (c) =>
    c.json(
      toExecutionProjectDto(
        await execution(c).create(c.var.user.id, await readJson(c)),
      ),
      201,
    ),
  )
  .get("/projects/:id", async (c) =>
    c.json(
      toExecutionDetailDto(
        await execution(c).get(c.var.user.id, c.req.param("id")),
      ),
    ),
  )
  .patch("/projects/:id", rateLimit("research"), async (c) =>
    c.json(
      toExecutionProjectDto(
        await execution(c).update(
          c.var.user.id,
          c.req.param("id"),
          await readJson(c),
        ),
      ),
    ),
  )
  .post("/projects/:id/events", rateLimit("research"), async (c) =>
    c.json(
      toExecutionEventDto(
        await execution(c).addEvent(
          c.var.user.id,
          c.req.param("id"),
          await readJson(c),
        ),
      ),
      201,
    ),
  )
  .post("/projects/:id/revenue", rateLimit("research"), async (c) =>
    c.json(
      toRevenueEventDto(
        await execution(c).addRevenue(
          c.var.user.id,
          c.req.param("id"),
          await readJson(c),
        ),
      ),
      201,
    ),
  )
  .delete(
    "/projects/:id/events/:recordId",
    rateLimit("research"),
    async (c) => {
      await execution(c).remove(
        c.var.user.id,
        c.req.param("id"),
        "events",
        c.req.param("recordId"),
      );
      return c.body(null, 204);
    },
  )
  .delete(
    "/projects/:id/revenue/:recordId",
    rateLimit("research"),
    async (c) => {
      await execution(c).remove(
        c.var.user.id,
        c.req.param("id"),
        "revenue",
        c.req.param("recordId"),
      );
      return c.body(null, 204);
    },
  );
