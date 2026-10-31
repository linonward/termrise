import { expect, it } from "vitest";

import { buildNewWordBrief, newWordBriefFileName } from "./new-word-brief";
import type { NewWord } from "./new-words";

it("writes a new word's brief from saved data", () => {
  const word = {
    phrase: "store stock checker",
    about: "实时查看苹果商店库存的工具。",
    userWants: null,
    plan: "做新站首页。",
    verdict: "worth",
    buildAs: "new_site",
    ratio: 0.108,
    ratioDay: "2026-10-30",
    firstSeenAt: new Date("2026-10-31T00:00:00Z"),
    selectedAt: new Date("2026-11-01T00:00:00Z"),
    checkedAt: new Date("2026-10-31T00:00:00Z"),
    burstDay: "2026-10-19",
    peakDay: "2026-10-28",
    searchVolume: 260,
    keywordDifficulty: 22,
    dedicatedPages: 0,
    serp: [{ rank: 1, site: "apple.com", title: "Check availability" }],
    newSites: [],
    rules: "newword-v1",
  } as unknown as NewWord;
  const md = buildNewWordBrief(word, [{ root: "checker" } as never], []);
  expect(md).toContain("# 选词简报：store stock checker（新词）");
  expect(md).toContain("值得做，新站首页");
  expect(md).toContain("| 热度（GPTs 倍数） | ×0.108（2026-10-30） |");
  expect(md).toContain("- 用户想要什么：—");
  expect(md).toContain("1. Check availability（apple.com）");
  expect(newWordBriefFileName(word)).toBe(
    "keyword-brief-store-stock-checker.md",
  );
});
