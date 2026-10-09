import type { AiProvider } from "../provider";

/** Input that makes the fake provider fail, so tests can check the refund. */
export const FAKE_AI_FAILURE = "[fail]";

export function createFakeAiProvider(): AiProvider {
  return {
    name: "fake",
    async run(input) {
      if (input.includes(FAKE_AI_FAILURE)) throw new Error("fake failure");
      return { output: input.toUpperCase() };
    },
  };
}
