import { createDeepSeekJson } from "@repo/ai/adapters/deepseek-json";
import { createDataForSeoProvider } from "@repo/research/adapters/dataforseo";
import { createDeepSeekAnalyst } from "@repo/research/adapters/deepseek-analyst";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";

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

// The keyword data provider the env selects.
export function createKeywordProvider(env: WorkerEnv) {
  return env.KEYWORD_PROVIDER === "dataforseo"
    ? createDataForSeoProvider({
        login: env.DATAFORSEO_LOGIN!,
        password: env.DATAFORSEO_PASSWORD!,
      })
    : createFakeKeywordProvider();
}
