import { z } from "zod";

import { LAUNCH_MOTIVES } from "@repo/db/schema";

import type { Charged } from "./keyword-provider";

// Port for reading a launch post (docs/product/keyword-pool.md#launch-sites): what the
// site does, for whom, why the maker built it and the search phrase it serves. The why
// is the maker's own words when they give them; never invented.

export const launchSiteAnalysisSchema = z.object({
  category: z.enum(["tool", "ai", "game", "content", "saas", "dev", "other"]),
  motive: z.enum(LAUNCH_MOTIVES),
  /** True only when the post or the maker's replies say why. */
  stated: z.boolean(),
  about: z.string().min(1).max(120),
  audience: z.string().min(1).max(60),
  why: z.string().min(1).max(160),
  coreKeyword: z.string().min(1).max(60),
  keywordNote: z.string().max(60).optional(),
  monetization: z.string().min(1).max(40),
});
export type LaunchSiteAnalysis = z.infer<typeof launchSiteAnalysisSchema>;

export type LaunchSiteContext = {
  site: string;
  postTitle: string;
  makerWords: string | null;
  pageTitle: string | null;
};

export interface LaunchSiteAnalyst {
  name: "fake" | "deepseek";
  model: string | null;
  promptVersion: string;
  maxCostMicros: number;
  /** Raw output; the caller validates it with launchSiteAnalysisSchema. */
  analyze(context: LaunchSiteContext): Promise<Charged<unknown>>;
}
