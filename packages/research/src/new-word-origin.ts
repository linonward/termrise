// Why a new word rose (docs/product/keyword-pool.md#origins): the evidence the free sources
// return around its burst, and the analyst's reading of it. The cause decides how to meet
// the demand: a tool for a new model, a guide for a game update, nothing for news.
import { z } from "zod";

import { NEW_WORD_ORIGINS } from "@repo/db/schema";

import type { OriginEvidence, OriginWindow } from "./adapters/origin-sources";
import type { Charged } from "./keyword-provider";

export type NewWordOrigin = (typeof NEW_WORD_ORIGINS)[number];

/** Days before the burst searched for a start, and days after it. */
export const ORIGIN_DAYS_BEFORE = 30;
export const ORIGIN_DAYS_AFTER = 7;
const DAY_MS = 86_400_000;

export const newWordOriginSchema = z.object({
  originType: z.enum(NEW_WORD_ORIGINS),
  /** Chinese: what started it, when and where. */
  summary: z.string().min(1).max(240),
  /** The index of the evidence item that started it; null when none did. */
  first: z.number().int().min(0).nullable(),
  /** The indexes of the evidence items the summary relies on. */
  cited: z.array(z.number().int().min(0)).max(10),
  /** Chinese: how to meet the demand, given the cause. */
  capture: z.string().min(1).max(240),
});
export type NewWordOriginAnalysis = z.infer<typeof newWordOriginSchema>;

/** What a search result page says about the cause: videos, forums, wikis on page one. */
export type SerpMix = { video: number; social: number; wiki: number };

const VIDEO = /(^|\.)(youtube\.com|tiktok\.com|vimeo\.com|twitch\.tv)$/;
const SOCIAL =
  /(^|\.)(reddit\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|threads\.net|quora\.com|discord\.com)$/;
const WIKI = /(^|\.)(wikipedia\.org|fandom\.com|wiki\.gg)$/;

export function serpMix(serp: { site: string }[]): SerpMix {
  const top = serp.slice(0, 10).map((r) => r.site.toLowerCase());
  return {
    video: top.filter((s) => VIDEO.test(s)).length,
    social: top.filter((s) => SOCIAL.test(s)).length,
    wiki: top.filter((s) => WIKI.test(s)).length,
  };
}

/** Where to look for the start: a month before the burst (or first sighting) to a week after. */
export function originWindow(
  burstDay: string | null,
  firstSeenAt: Date,
  now: Date,
): OriginWindow {
  const anchor = burstDay ? new Date(`${burstDay}T00:00:00Z`) : firstSeenAt;
  const to = new Date(
    Math.min(anchor.getTime() + ORIGIN_DAYS_AFTER * DAY_MS, now.getTime()),
  );
  return { from: new Date(anchor.getTime() - ORIGIN_DAYS_BEFORE * DAY_MS), to };
}

export type NewWordOriginContext = {
  phrase: string;
  burstDay: string | null;
  firstSeen: string;
  /** Numbered from 0: the analyst cites them by index. */
  evidence: (OriginEvidence & { i: number })[];
  serp: { site: string; title: string }[];
  serpMix: SerpMix;
};

export interface NewWordOriginAnalyst {
  name: "fake" | "deepseek";
  model: string | null;
  promptVersion: string;
  maxCostMicros: number;
  /** Raw output; the caller validates it with newWordOriginSchema. */
  analyze(context: NewWordOriginContext): Promise<Charged<unknown>>;
}

export type StoredEvidence = OriginEvidence & {
  cited: boolean;
  first: boolean;
};

/** The evidence with the analyst's citations; indexes outside the list are ignored. */
export function markEvidence(
  evidence: OriginEvidence[],
  analysis: NewWordOriginAnalysis,
): StoredEvidence[] {
  const cited = new Set(analysis.cited);
  return evidence.map((e, i) => ({
    ...e,
    cited: cited.has(i) || analysis.first === i,
    first: analysis.first === i,
  }));
}
