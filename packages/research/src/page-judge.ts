// The page check (docs/product/keyword-pool.md#page-check): the analyst reads the top
// results' own pages and says which are made for the phrase, what kind of page each is,
// and which are weak. It replaces the title rule for H5 when it ran; numbers stay rules.
import { z } from "zod";

import type { PageText } from "./adapters/page-reader";
import type { Charged } from "./keyword-provider";

export const PAGE_KINDS = [
  "tool",
  "article",
  "forum",
  "video",
  "directory",
  "store",
  "official",
  "other",
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const pageJudgementSchema = z.object({
  pages: z
    .array(
      z.object({
        i: z.number().int().min(0),
        /** The page's main content is a tool or answer for exactly this search. */
        madeForPhrase: z.boolean(),
        kind: z.enum(PAGE_KINDS),
        /** Broken, empty, thin, outdated or mostly ads: a page that can be beaten. */
        weak: z.boolean(),
        /** Chinese, one short phrase. */
        note: z.string().max(80),
      }),
    )
    .max(20),
});
export type PageJudgement = z.infer<
  typeof pageJudgementSchema
>["pages"][number];

export type PageJudgeContext = {
  phrase: string;
  pages: (Omit<PageText, "url"> & {
    i: number;
    site: string | null;
    url: string;
    serpTitle: string;
  })[];
};

export interface PageJudge {
  name: "fake" | "deepseek";
  model: string | null;
  promptVersion: string;
  maxCostMicros: number;
  /** Raw output; the caller validates it with pageJudgementSchema. */
  judge(context: PageJudgeContext): Promise<Charged<unknown>>;
}

/** The judgements by result index; entries outside the results are dropped. */
export function judgementsByIndex(raw: unknown, results: number) {
  const parsed = pageJudgementSchema.safeParse(raw);
  if (!parsed.success) return null;
  return new Map(
    parsed.data.pages.filter((p) => p.i < results).map((p) => [p.i, p]),
  );
}
