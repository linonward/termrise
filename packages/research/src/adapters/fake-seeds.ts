import type { SeedExtractor } from "../seed-extractor";

/** A seed containing this marker makes the fake extractor return invalid output. */
export const FAKE_SEEDS_INVALID = "[bad-ai]";
/** Made-up price of one suggestion, in micro-USD; not a provider's rate. */
export const FAKE_SEEDS_COST = { max: 2_000, actual: 300 } as const;

// "Name – what it does" or "Name: what it does".
const SEPARATOR = /\s+[–—-]\s+|:\s+/;

// Test extractor: the words after a title's separator, three at a time. Not an AI; the
// UI labels its phrases as test output.
export function createFakeSeedExtractor(): SeedExtractor {
  return {
    name: "fake",
    model: null,
    promptVersion: "fake-v1",
    maxCostMicros: FAKE_SEEDS_COST.max,
    async extract(seeds) {
      if (seeds.some((seed) => seed.includes(FAKE_SEEDS_INVALID)))
        return { value: { phrases: [] }, costMicros: FAKE_SEEDS_COST.actual };
      const phrases = seeds.flatMap((seed) => {
        const words = seed.split(SEPARATOR).at(-1)!.split(" ");
        return [words.slice(0, 3).join(" "), words.slice(-3).join(" ")];
      });
      return { value: { phrases }, costMicros: FAKE_SEEDS_COST.actual };
    },
  };
}
