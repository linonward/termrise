import type { NewWordAnalyst } from "../new-word-analyst";

/** Made-up price of one analysis, in micro-USD; not a provider's rate. */
export const FAKE_NEW_WORDS_COST = { max: 3_000, actual: 500 } as const;

// Test analyst: fixed sentences that say they are test output. Not an AI.
export function createFakeNewWordAnalyst(): NewWordAnalyst {
  return {
    name: "fake",
    model: null,
    promptVersion: "fake-v1",
    maxCostMicros: FAKE_NEW_WORDS_COST.max,
    async analyze({ phrase, roots, buildAs }) {
      return {
        value: {
          category: roots.includes("ai") ? "ai" : "other",
          about: `测试数据：${phrase}`,
          userWants: `测试数据：搜索 ${phrase} 的人想要的东西`,
          plan:
            buildAs === "new_site"
              ? "测试数据：做新站首页"
              : "测试数据：做内页",
          direction: buildAs === "long_tail" ? "comparison" : "tool",
          copyrightRisk: /emulator|rom/.test(phrase),
        },
        costMicros: FAKE_NEW_WORDS_COST.actual,
      };
    },
  };
}
