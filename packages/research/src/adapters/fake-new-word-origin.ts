import type { NewWordOriginAnalyst } from "../new-word-origin";

export const FAKE_ORIGIN_COST = { max: 3_000, actual: 500 } as const;

// Test analyst: a fixed reading of the evidence that says it is test output. Not an AI.
export function createFakeNewWordOriginAnalyst(): NewWordOriginAnalyst {
  return {
    name: "fake",
    model: null,
    promptVersion: "fake-v1",
    maxCostMicros: FAKE_ORIGIN_COST.max,
    async analyze({ phrase, evidence }) {
      const model = evidence.find((e) => e.kind === "model");
      const repo = evidence.find((e) => e.kind === "repo");
      const story = evidence.find((e) => e.kind === "story");
      const first = model ?? repo ?? story ?? null;
      return {
        value: {
          originType: model
            ? "model_release"
            : repo
              ? "open_source"
              : story
                ? "product_launch"
                : "unknown",
          summary: first
            ? `测试数据：${phrase} 来自 ${first.title}`
            : "测试数据：找不到起因",
          first: first?.i ?? null,
          cited: evidence.slice(0, 3).map((e) => e.i),
          capture: "测试数据：承接方式",
        },
        costMicros: FAKE_ORIGIN_COST.actual,
      };
    },
  };
}
