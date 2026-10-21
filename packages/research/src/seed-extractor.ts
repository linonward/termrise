import { z } from "zod";

import type { Charged } from "./keyword-provider";
import { normalizeSeeds, SEED_MAX_LENGTH } from "./research-rules";

// Port for suggesting short search phrases from long seeds, such as a whole story title
// (docs/architecture/data-model.md#seed-suggestions). The phrases are suggestions only:
// the user reviews them before they become seeds. No numbers come from it.

/** Most phrases one suggestion keeps. */
export const MAX_SUGGESTED_PHRASES = 10;
/** Seeds of more words than this are worth shortening. */
export const LONG_SEED_WORDS = 4;

export const seedPhrasesSchema = z.object({
  phrases: z.array(z.string().min(1).max(SEED_MAX_LENGTH)).min(1).max(20),
});

/** Phrases as seeds: normalized, without duplicates or ones longer than a seed, capped. */
export function suggestedPhrases(output: z.infer<typeof seedPhrasesSchema>) {
  return normalizeSeeds(output.phrases)
    .filter((phrase) => phrase.length <= SEED_MAX_LENGTH)
    .slice(0, MAX_SUGGESTED_PHRASES);
}

/** True when a seed reads like a sentence rather than a search phrase. */
export const isLongSeed = (seed: string) =>
  seed.split(" ").length > LONG_SEED_WORDS;

export interface SeedExtractor {
  name: "fake" | "deepseek";
  model: string | null;
  /** Changes when the prompt or its output shape changes. */
  promptVersion: string;
  /** The most one suggestion can cost, reserved from the AI budget before it. */
  maxCostMicros: number;
  /** Raw output; the caller validates it with seedPhrasesSchema. */
  extract(seeds: string[]): Promise<Charged<unknown>>;
}
