import type { Context } from "hono";

import { createAiProvider } from "@repo/ai/create-provider";
import { toTaskDto } from "@repo/tasks/task-dto";
import { createTaskService } from "@repo/tasks/task-service";

import { requestAnalytics } from "../analytics";
import { apiEnv, type AppEnv } from "../env";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

// Example paid action (docs/architecture/tasks.md), called from the dashboard.
export const tasks = userRoutes()
  .get("/", async (c) => {
    const service = taskService(c);
    await service.failStaleTasks(c.var.user.id);
    const items = await service.list(c.var.user.id);
    return c.json({ items: items.map(toTaskDto) });
  })
  .post("/", rateLimit("task"), async (c) => {
    const task = await taskService(c).run(c.var.user.id, await readJson(c));
    return c.json(toTaskDto(task), 201);
  });

function taskService(c: Context<AppEnv>) {
  const env = apiEnv(c.env);
  return createTaskService({
    database: c.var.db,
    // env.ts requires both values when TASK_PROVIDER=deepseek.
    provider:
      env.TASK_PROVIDER === "deepseek"
        ? createAiProvider({
            provider: "deepseek",
            apiKey: env.DEEPSEEK_API_KEY!,
            model: env.DEEPSEEK_MODEL!,
          })
        : createAiProvider({ provider: env.TASK_PROVIDER }),
    analytics: requestAnalytics(c),
  });
}
