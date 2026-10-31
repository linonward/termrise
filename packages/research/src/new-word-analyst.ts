import { z } from "zod";

import { NEW_WORD_CATEGORIES } from "@repo/db/schema";

import type { Charged } from "./keyword-provider";

// Port for explaining a new word (docs/product/keyword-pool.md#new-words): its category
// and three short answers in Chinese. No numbers come from it; the verdict is a rule.

export const newWordAnalysisSchema = z.object({
  category: z.enum(NEW_WORD_CATEGORIES),
  about: z.string().min(1).max(200),
  userWants: z.string().min(1).max(200),
  plan: z.string().min(1).max(200),
});
export type NewWordAnalysis = z.infer<typeof newWordAnalysisSchema>;

export type NewWordContext = {
  phrase: string;
  /** The root words it rose under. */
  roots: string[];
  /** Titles of the top results: what the web already says about it. */
  titles: string[];
  /** The rule's advice, so the plan matches it. */
  buildAs: "new_site" | "inner_page" | null;
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
