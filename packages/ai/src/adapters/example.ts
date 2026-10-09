import type { AiProvider } from "../provider";

// Placeholder result so the starter runs end to end without a third-party key.
export function createExampleAiProvider(): AiProvider {
  return {
    name: "example",
    async run(input) {
      return { output: input.split("").reverse().join("") };
    },
  };
}
