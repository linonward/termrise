import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText, Output } from "ai";

import { safeError } from "./deepseek";

/** Tokens of one call as DeepSeek bills them. */
export type DeepSeekUsage = {
  /** Input tokens read from DeepSeek's context cache (the lower input price). */
  cacheHitTokens: number;
  cacheMissTokens: number;
  /** Output tokens, reasoning included. */
  outputTokens: number;
};

// One JSON answer from DeepSeek, with the tokens to bill
// (https://api-docs.deepseek.com/guides/json_mode). The AI SDK sends
// response_format json_object; the instructions must say "json" and show the shape.
// The caller validates the value: it is untrusted model output.
export function createDeepSeekJson(options: {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}) {
  const deepseek = createDeepSeek({
    apiKey: options.apiKey,
    fetch: options.fetch,
  });
  return {
    model: options.model,
    async generate(input: {
      instructions: string;
      prompt: string;
      maxOutputTokens: number;
    }): Promise<{ value: unknown; usage: DeepSeekUsage }> {
      const result = await generateText({
        model: deepseek(options.model),
        instructions: input.instructions,
        prompt: input.prompt,
        output: Output.json(),
        maxOutputTokens: input.maxOutputTokens,
        timeout: options.timeoutMs ?? 60_000,
        // One attempt: a retry is a second paid call the budget did not reserve.
        maxRetries: 0,
        // No thinking: it bills reasoning tokens and the analysis does not need it.
        providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      }).catch((error: unknown) => {
        throw safeError(error);
      });
      const { usage } = result;
      const cacheHitTokens = usage.inputTokenDetails.cacheReadTokens ?? 0;
      return {
        value: result.output,
        usage: {
          cacheHitTokens,
          cacheMissTokens:
            usage.inputTokenDetails.noCacheTokens ??
            (usage.inputTokens ?? 0) - cacheHitTokens,
          outputTokens: usage.outputTokens ?? 0,
        },
      };
    },
  };
}

export type DeepSeekJson = ReturnType<typeof createDeepSeekJson>;
