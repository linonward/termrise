import type { LaunchSiteAnalyst } from "../launch-site-analyst";

export const FAKE_LAUNCH_SITES_COST = { max: 3_000, actual: 500 } as const;

// Test analyst: fixed answers that say they are test output. Not an AI.
export function createFakeLaunchSiteAnalyst(): LaunchSiteAnalyst {
  return {
    name: "fake",
    model: null,
    promptVersion: "fake-v1",
    maxCostMicros: FAKE_LAUNCH_SITES_COST.max,
    async analyze({ site, postTitle, makerWords }) {
      const stated = /because|i built|i made/i.test(makerWords ?? "");
      return {
        value: {
          category: "tool",
          motive: stated ? "own_pain" : "unstated",
          stated,
          about: `测试数据：${postTitle}`,
          audience: "测试数据",
          why: stated ? "测试数据：作者说了原因" : "原文未说明制作原因",
          coreKeyword: site.split(".")[0].replace(/-/g, " "),
          keywordNote: "域名就是这个词",
          monetization: "看不出",
        },
        costMicros: FAKE_LAUNCH_SITES_COST.actual,
      };
    },
  };
}
