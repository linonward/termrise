import { Hono, type Context } from "hono";

import { createAiProvider } from "@repo/ai/create-provider";
import { AppError } from "@repo/observability/errors";
import { toTaskDto } from "@repo/tasks/task-dto";
import { createTaskService } from "@repo/tasks/task-service";

import { requestAnalytics } from "../analytics";
import { apiEnv, type AppEnv } from "../env";
import { database } from "../middleware/database";
import { rateLimit } from "../middleware/rate-limit";
import { session } from "../middleware/session";
import { webCors } from "../middleware/web-cors";
import { webCsrf } from "../middleware/web-csrf";

// Example paid action (docs/architecture/tasks.md), called from the dashboard.
export const tasks = new Hono<AppEnv>()
  .use("*", webCors)
  .use("*", webCsrf)
  .use("*", database)
  .use("*", session)
  .get("/", async (c) => {
    const service = taskService(c);
    await service.failStaleTasks(c.var.user.id);
    const items = await service.list(c.var.user.id);
    return c.json({ items: items.map(toTaskDto) });
  })
  .post("/", rateLimit("task"), async (c) => {
    const body = await c.req.json().catch(() => {
      throw new AppError("INVALID_INPUT", "Body must be JSON");
    });
    const task = await taskService(c).run(c.var.user.id, body);
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
