import { z } from "zod";

import { NEW_WORD_CATEGORIES, NEW_WORD_DIRECTIONS } from "@repo/db/schema";

import type { Charged } from "./keyword-provider";

// Port for explaining a new word (docs/product/keyword-pool.md#new-words): its category
// and three short answers in Chinese. No numbers come from it; the verdict is a rule.

export const newWordAnalysisSchema = z.object({
  category: z.enum(NEW_WORD_CATEGORIES),
  about: z.string().min(1).max(200),
  userWants: z.string().min(1).max(200),
  plan: z.string().min(1).max(200),
  /** The kind of page to build (S76). */
  direction: z.enum(NEW_WORD_DIRECTIONS),
  /** Emulators, game ports, cracks, someone else's content (S76). */
  copyrightRisk: z.boolean(),
});
export type NewWordAnalysis = z.infer<typeof newWordAnalysisSchema>;

export type NewWordContext = {
  phrase: string;
  /** The root words it rose under. */
  roots: string[];
  /** Titles of the top results: what the web already says about it. */
  titles: string[];
  /** The rule's advice, so the plan matches it. */
  buildAs: "new_site" | "inner_page" | "long_tail" | null;
};

export interface NewWordAnalyst {
  name: "fake" | "deepseek";
  model: string | null;
  promptVersion: string;
  /** The most one analysis can cost, reserved from the AI budget before it. */
  maxCostMicros: number;
  /** Raw output; the caller validates it with newWordAnalysisSchema. */
  analyze(context: NewWordContext): Promise<Charged<unknown>>;
}

/** Classes worth a screen: names of models and games, and tools (S75). "generic" is not. */
export const BUILDABLE_CATEGORIES = ["ai", "game", "tool"] as const;

export const newWordClassesSchema = z.object({
  items: z.array(
    z.object({
      phrase: z.string(),
      category: z.enum(NEW_WORD_CATEGORIES),
    }),
  ),
});

/**
 * Port for sorting just-found words before the paid screen (S75): a person, a match or a
 * news event is not built for, so it stops before Trends is paid for.
 */
export interface NewWordClassifier {
  name: "fake" | "deepseek";
  model: string | null;
  promptVersion: string;
  /** The most one batch of up to CLASSIFY_BATCH phrases can cost. */
  maxCostMicros: number;
  /**
   * Raw output; the caller validates it with newWordClassesSchema. A source says where a
   * name came from (product_hunt...): a launch, so only a common word is "generic".
   */
  classify(
    items: { phrase: string; source: string | null }[],
  ): Promise<Charged<unknown>>;
}

/** Phrases sorted in one call. */
export const CLASSIFY_BATCH = 50;
