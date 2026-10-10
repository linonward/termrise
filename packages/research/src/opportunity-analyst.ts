import { z } from "zod";

// Port for the AI analysis of an opportunity (docs/product/product.md#ai-责任边界): who it
// is for and what to build, as hypotheses tied to evidence. It never writes scores,
// volumes or difficulty; those come from the data and the scoring rules.

export const analysisSchema = z.object({
  targetUser: z.string().min(1).max(300),
  job: z.string().min(1).max(300),
  alternatives: z.array(z.string().min(1).max(200)).max(5),
  differentiation: z.string().min(1).max(500),
  pricing: z.string().min(1).max(300),
  channels: z.array(z.string().min(1).max(200)).max(5),
  mvpScope: z.array(z.string().min(1).max(200)).min(1).max(7),
  risks: z.array(z.string().min(1).max(300)).min(1).max(5),
});

export type Analysis = z.infer<typeof analysisSchema>;

export type AnalysisInput = {
  cluster: string;
  keywords: { phrase: string; searchVolume: number | null; intent: string }[];
  serpTitles: string[];
  signalSources: string[];
};

export interface OpportunityAnalyst {
  name: "fake";
  /** Changes when the prompt or its output shape changes. */
  promptVersion: string;
  /** Raw output; the caller validates it with analysisSchema. */
  analyze(input: AnalysisInput): Promise<unknown>;
}
