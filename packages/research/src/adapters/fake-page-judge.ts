import type { PageJudge } from "../page-judge";
import { isDedicated } from "../serp-competition";

export const FAKE_PAGE_JUDGE_COST = { max: 3_000, actual: 500 } as const;

// Test judge: a fixed reading from the page text. Not an AI.
export function createFakePageJudge(): PageJudge {
  return {
    name: "fake",
    model: null,
    promptVersion: "fake-v1",
    maxCostMicros: FAKE_PAGE_JUDGE_COST.max,
    async judge({ phrase, pages }) {
      return {
        value: {
          pages: pages.map((p) => ({
            i: p.i,
            madeForPhrase:
              (p.status ?? 0) < 400 &&
              [p.title, p.h1, p.serpTitle].some(
                (t) => t != null && isDedicated(t, phrase),
              ),
            kind: /youtube/.test(p.site ?? "")
              ? "video"
              : /reddit|quora/.test(p.site ?? "")
                ? "forum"
                : /\.gov$/.test(p.site ?? "")
                  ? "official"
                  : /calculat|generat|convert/i.test(p.text)
                    ? "tool"
                    : "article",
            weak: p.status === null || p.status >= 400 || p.text.length < 50,
            note: "测试数据",
          })),
        },
        costMicros: FAKE_PAGE_JUDGE_COST.actual,
      };
    },
  };
}
