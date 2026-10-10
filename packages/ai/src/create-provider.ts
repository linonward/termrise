import { createDeepSeekProvider } from "./adapters/deepseek";
import { createExampleAiProvider } from "./adapters/example";
import { createFakeAiProvider } from "./adapters/fake";
import type { AiProvider } from "./provider";

export type AiProviderConfig =
  | { provider: "example" | "fake" }
  | { provider: "deepseek"; apiKey: string; model: string };

// One place maps the TASK_PROVIDER setting to an adapter; each app passes its own env.
export function createAiProvider(config: AiProviderConfig): AiProvider {
  switch (config.provider) {
    case "fake":
      return createFakeAiProvider();
    case "deepseek":
      return createDeepSeekProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    case "example":
      return createExampleAiProvider();
  }
}
