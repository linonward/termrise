import { z } from "zod";

import { AppError } from "@repo/observability/errors";
import { toTaskDto } from "@repo/tasks/task-dto";

import { readJson } from "../http";
import { rateLimit } from "../middleware/rate-limit";
import { requestTasks } from "../tasks";
import { userRoutes } from "./user-routes";

const limitSchema = z.coerce.number().int().min(1).max(20).default(20);

// Example paid action (docs/architecture/tasks.md), called from the dashboard.
export const tasks = userRoutes()
  .get("/", async (c) => {
    const limit = limitSchema.safeParse(c.req.query("limit"));
    if (!limit.success)
      throw new AppError("INVALID_INPUT", "limit must be 1 to 20");
    const service = requestTasks(c);
    await service.failStaleTasks(c.var.user.id);
    const items = await service.list(c.var.user.id, limit.data);
    return c.json({ items: items.map(toTaskDto) });
  })
  .post("/", rateLimit("task"), async (c) => {
    const task = await requestTasks(c).run(c.var.user.id, await readJson(c));
    return c.json(toTaskDto(task), 201);
  });
