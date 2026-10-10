import type { Context } from "hono";

import { createAiProvider } from "@repo/ai/create-provider";
import { createTaskService } from "@repo/tasks/task-service";

import { requestAnalytics } from "./analytics";
import { apiEnv, type AppEnv } from "./env";

/** The example paid action's service on this request's connection (docs/architecture/tasks.md). */
export function requestTasks(c: Context<AppEnv>) {
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
