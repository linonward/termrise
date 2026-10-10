import { createDeepSeekJson } from "@repo/ai/adapters/deepseek-json";
import { createDeepSeekAnalyst } from "@repo/research/adapters/deepseek-analyst";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";

import type { WorkerEnv } from "./env";

// The opportunity analyst the env selects; workerEnv() has checked its variables.
export function createAnalyst(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekAnalyst(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeAnalyst();
}
