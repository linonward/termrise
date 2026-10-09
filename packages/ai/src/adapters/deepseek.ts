import { createDeepSeek } from "@ai-sdk/deepseek";
import { APICallError, generateText, RetryError } from "ai";

import type { AiProvider } from "../provider";

// AI SDK DeepSeek provider: https://ai-sdk.dev/providers/ai-sdk-providers/deepseek
export function createDeepSeekProvider(options: {
  apiKey: string;
  model: string;
  instructions?: string;
  /** Total time with retries; must stay below STALE_TASK_MS and the function's max duration. */
  timeoutMs?: number;
  /** Caps the tokens the provider bills for one answer. */
  maxOutputTokens?: number;
  fetch?: typeof fetch;
}): AiProvider {
  const deepseek = createDeepSeek({
    apiKey: options.apiKey,
    fetch: options.fetch,
  });
  return {
    name: "deepseek",
    async run(input) {
      const result = await generateText({
        model: deepseek(options.model),
        instructions: options.instructions,
        prompt: input,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
        timeout: options.timeoutMs ?? 60_000,
      }).catch((error: unknown) => {
        throw safeError(error);
      });
      // "length": the answer hit maxOutputTokens. The tokens are billed, so the
      // cut answer is a result; failing would refund credits for paid work.
      if (result.finishReason !== "stop" && result.finishReason !== "length")
        throw new Error(
          `DeepSeek answer did not finish: ${result.finishReason}`,
        );
      if (!result.text) throw new Error("DeepSeek answer has no text");
      return { output: result.text };
    },
  };
}

// APICallError carries requestBodyValues (the full prompt) and responseBody, and
// Sentry receives the thrown error: keep only the status, with no cause.
function safeError(error: unknown) {
  const last = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(last))
    return new Error(
      `DeepSeek request failed: ${last.statusCode ?? "network"}`,
    );
  return new Error(
    `DeepSeek request failed: ${last instanceof Error ? last.name : "unknown"}`,
  );
}
