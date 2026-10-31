import { createDeepSeekJson } from "@repo/ai/adapters/deepseek-json";
import { createDataForSeoProvider } from "@repo/research/adapters/dataforseo";
import { createDeepSeekAnalyst } from "@repo/research/adapters/deepseek-analyst";
import { createDeepSeekNewWordAnalyst } from "@repo/research/adapters/deepseek-new-words";
import { createDeepSeekSeedExtractor } from "@repo/research/adapters/deepseek-seeds";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import { createFakeNewWordAnalyst } from "@repo/research/adapters/fake-new-words";
import { createFakeSeedExtractor } from "@repo/research/adapters/fake-seeds";

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

// Seed suggestions use the analyst's provider and model: no variables of their own.
export function createSeedExtractor(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekSeedExtractor(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeSeedExtractor();
}

// New-word explanations use the analyst's provider and model too.
export function createNewWordAnalyst(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekNewWordAnalyst(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeNewWordAnalyst();
}
