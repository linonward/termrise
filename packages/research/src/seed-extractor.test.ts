import { expect, it } from "vitest";

import { SEED_MAX_LENGTH } from "./research-rules";
import {
  isLongSeed,
  MAX_SUGGESTED_PHRASES,
  seedPhrasesSchema,
  suggestedPhrases,
} from "./seed-extractor";

it("normalizes the phrases, drops duplicates and caps them", () => {
  expect(
    suggestedPhrases({
      phrases: ["  Local LLM  Speed ", "local llm speed", "LLM hardware"],
    }),
  ).toEqual(["local llm speed", "llm hardware"]);
  const many = Array.from({ length: 20 }, (_, i) => `phrase ${i}`);
  expect(suggestedPhrases({ phrases: many })).toHaveLength(
    MAX_SUGGESTED_PHRASES,
  );
});

it("rejects output without phrases or with phrases too long for a seed", () => {
  expect(seedPhrasesSchema.safeParse({ phrases: [] }).success).toBe(false);
  expect(seedPhrasesSchema.safeParse({ seeds: ["a"] }).success).toBe(false);
  expect(
    seedPhrasesSchema.safeParse({ phrases: ["x".repeat(SEED_MAX_LENGTH + 1)] })
      .success,
  ).toBe(false);
});

it("finds seeds that read like sentences", () => {
  expect(isLongSeed("local llm speed")).toBe(false);
  expect(isLongSeed("ai meeting notes app")).toBe(false);
  expect(
    isLongSeed("llmspeed – feel how fast a local llm runs before you buy"),
  ).toBe(true);
});
