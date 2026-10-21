import { z } from "zod";

import type { Charged } from "./keyword-provider";

// Port for the AI analysis of an opportunity (docs/product/product.md#ai-责任边界): who it
// is for and what to build, as hypotheses tied to evidence. It never writes scores,
// volumes or difficulty; those come from the data and the scoring rules.

/** Off-topic keywords one analysis can mark (60 from analysis-v3, 30 before). */
export const MAX_OFF_TOPIC_KEYWORDS = 60;

export const analysisSchema = z.object({
  targetUser: z.string().min(1).max(300),
  job: z.string().min(1).max(300),
  alternatives: z.array(z.string().min(1).max(200)).max(5),
  differentiation: z.string().min(1).max(500),
  pricing: z.string().min(1).max(300),
  channels: z.array(z.string().min(1).max(200)).max(5),
  mvpScope: z.array(z.string().min(1).max(200)).min(1).max(7),
  risks: z.array(z.string().min(1).max(300)).min(1).max(5),
  // Keywords that mean something else than the product in the source titles. From
  // scoring v4 they do not count in the score. Absent in analyses before analysis-v2.
  offTopicKeywords: z
    .array(z.string().min(1).max(200))
    .max(MAX_OFF_TOPIC_KEYWORDS)
    .default([]),
});

// As stored: analyses before analysis-v2 have no offTopicKeywords.
export type Analysis = z.input<typeof analysisSchema>;

export type AnalysisInput = {
  cluster: string;
  keywords: { phrase: string; searchVolume: number | null; intent: string }[];
  serpTitles: string[];
  signalSources: string[];
  /** Titles of the stories the project started from, e.g. a Show HN post. */
  sourceTitles: string[];
};

export interface OpportunityAnalyst {
  name: "fake" | "deepseek";
  /** The model, for providers that have one. */
  model: string | null;
  /** Changes when the prompt or its output shape changes. */
  promptVersion: string;
  /** The most one analysis can cost, reserved from the AI budget before it. */
  maxCostMicros: number;
  /** Raw output; the caller validates it with analysisSchema. */
  analyze(input: AnalysisInput): Promise<Charged<unknown>>;
}
