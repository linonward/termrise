import "server-only";
import { createAiProvider } from "@repo/ai/create-provider";
import { serverEnv } from "@repo/config/env";
import { db } from "@repo/db/client";
import { createTaskService } from "@repo/tasks/task-service";

import { getAnalyticsService } from "@/server/analytics/analytics";

function aiProvider() {
  const env = serverEnv();
  return env.TASK_PROVIDER === "deepseek"
    ? // env.ts requires both values when TASK_PROVIDER=deepseek.
      createAiProvider({
        provider: "deepseek",
        apiKey: env.DEEPSEEK_API_KEY!,
        model: env.DEEPSEEK_MODEL!,
      })
    : createAiProvider({ provider: env.TASK_PROVIDER });
}

// Pages and platform code read tasks here until they call apps/api
// (docs/adr/012-api-modular-monolith.md, step 5); runs go through POST /api/tasks on the API.
export function getTaskService() {
  return createTaskService({
    database: db(),
    provider: aiProvider(),
    analytics: getAnalyticsService(),
  });
}
