import "server-only";
import { createDeepSeekProvider } from "@repo/ai/adapters/deepseek";
import { createExampleAiProvider } from "@repo/ai/adapters/example";
import { createFakeAiProvider } from "@repo/ai/adapters/fake";
import { serverEnv } from "@repo/config/env";
import { db } from "@repo/db/client";

import { getAnalyticsService } from "@/server/analytics/analytics";

import { createTaskService, type Task } from "./task-service";

function aiProvider() {
  const env = serverEnv();
  switch (env.TASK_PROVIDER) {
    case "fake":
      return createFakeAiProvider();
    case "deepseek":
      // env.ts requires both values when TASK_PROVIDER=deepseek.
      return createDeepSeekProvider({
        apiKey: env.DEEPSEEK_API_KEY!,
        model: env.DEEPSEEK_MODEL!,
      });
    case "example":
      return createExampleAiProvider();
  }
}

export function getTaskService() {
  return createTaskService({
    database: db(),
    provider: aiProvider(),
    analytics: getAnalyticsService(),
  });
}

// Public shape: no request id.
export function toTaskDto(t: Task) {
  return {
    id: t.id,
    status: t.status,
    input: t.input,
    output: t.output,
    creditsCost: t.creditsCost,
    errorCode: t.errorCode,
    createdAt: t.createdAt.toISOString(),
  };
}

export type TaskDto = ReturnType<typeof toTaskDto>;
